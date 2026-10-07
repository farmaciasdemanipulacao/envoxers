from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.registro_foco import RegistroFoco
from app.models.foco_ajuste import FocoAjuste
from app.models.tarefa import Tarefa
from app.models.cliente import Cliente
from app.models.comercial import ComercialTask, ComercialLead
from app.models.demanda_avulsa import DemandaAvulsa
from app.schemas.foco_relatorio import (
    FocoRelatorioContexto,
    FocoRelatorioDia,
    FocoRelatorioOrigem,
    FocoRelatorioPessoa,
    FocoRelatorioPessoaOpcao,
    FocoRelatorioRegistro,
    FocoRelatorioResponse,
    FocoRelatorioResumo,
)

router = APIRouter(prefix="/foco/admin", tags=["foco-admin"])
TZ_LOCAL = ZoneInfo("America/Sao_Paulo")
ORIGEM_LABEL = {
    "operacao": "Operação",
    "comercial": "Comercial",
    "avulsa": "Demandas avulsas",
}


def _limites_periodo(inicio: Optional[date], fim: Optional[date]):
    hoje = datetime.now(TZ_LOCAL).date()
    fim_local = fim or hoje
    inicio_local = inicio or (fim_local - timedelta(days=29))
    if fim_local < inicio_local:
        raise HTTPException(status_code=422, detail="Data final deve ser igual ou posterior à data inicial")
    if (fim_local - inicio_local).days > 366:
        raise HTTPException(status_code=422, detail="O relatório aceita no máximo 367 dias por consulta")

    inicio_dt = datetime.combine(inicio_local, time.min, tzinfo=TZ_LOCAL).astimezone(timezone.utc)
    fim_dt = datetime.combine(fim_local + timedelta(days=1), time.min, tzinfo=TZ_LOCAL).astimezone(timezone.utc)
    return inicio_local, fim_local, inicio_dt, fim_dt


def _origem(registro: RegistroFoco) -> str:
    if registro.comercial_task_id is not None:
        return "comercial"
    if registro.demanda_avulsa_id is not None:
        return "avulsa"
    return "operacao"


@router.get("/relatorio", response_model=FocoRelatorioResponse)
async def relatorio_focos_time(
    _: Annotated[Envoxer, Depends(get_current_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    inicio: Optional[date] = Query(None),
    fim: Optional[date] = Query(None),
    envoxer_id: Optional[int] = Query(None),
    origem: Optional[str] = Query(None, pattern="^(operacao|comercial|avulsa)$"),
):
    inicio_local, fim_local, inicio_dt, fim_dt = _limites_periodo(inicio, fim)

    stmt = (
        select(
            RegistroFoco,
            Envoxer,
            Tarefa.titulo.label("tarefa_titulo"),
            Cliente.nome.label("cliente_nome"),
            ComercialTask.titulo.label("comercial_titulo"),
            ComercialLead.nome_estabelecimento.label("lead_nome"),
            DemandaAvulsa.titulo.label("avulsa_titulo"),
            DemandaAvulsa.contexto.label("avulsa_contexto"),
        )
        .join(Envoxer, Envoxer.id == RegistroFoco.envoxer_id)
        .outerjoin(Tarefa, Tarefa.id == RegistroFoco.tarefa_id)
        .outerjoin(Cliente, Cliente.id == Tarefa.cliente_id)
        .outerjoin(ComercialTask, ComercialTask.id == RegistroFoco.comercial_task_id)
        .outerjoin(ComercialLead, ComercialLead.id == ComercialTask.lead_id)
        .outerjoin(DemandaAvulsa, DemandaAvulsa.id == RegistroFoco.demanda_avulsa_id)
        .where(
            RegistroFoco.fim.is_not(None),
            RegistroFoco.descartado.is_(False),
            RegistroFoco.inicio >= inicio_dt,
            RegistroFoco.inicio < fim_dt,
        )
        .order_by(RegistroFoco.inicio.desc())
    )
    if envoxer_id is not None:
        stmt = stmt.where(RegistroFoco.envoxer_id == envoxer_id)

    rows = (await db.execute(stmt)).all()

    registros_base = []
    ids_registro = []
    for row in rows:
        reg = row[0]
        env = row[1]
        reg_origem = _origem(reg)
        if origem and reg_origem != origem:
            continue

        if reg_origem == "comercial":
            contexto = row.lead_nome
            titulo = row.comercial_titulo
        elif reg_origem == "avulsa":
            contexto = row.avulsa_contexto
            titulo = row.avulsa_titulo
        else:
            contexto = row.cliente_nome
            titulo = row.tarefa_titulo

        registros_base.append({
            "registro": reg,
            "envoxer": env,
            "origem": reg_origem,
            "contexto": contexto,
            "titulo": titulo,
        })
        ids_registro.append(reg.id)

    ajustados_ids: set[int] = set()
    if ids_registro:
        ajuste_rows = (await db.execute(
            select(FocoAjuste.registro_foco_id).where(
                FocoAjuste.status == "aprovado",
                FocoAjuste.registro_foco_id.in_(ids_registro),
            )
        )).scalars().all()
        ajustados_ids = {int(x) for x in ajuste_rows if x is not None}

    ativos_stmt = select(RegistroFoco.envoxer_id).where(
        RegistroFoco.fim.is_(None),
        RegistroFoco.descartado.is_(False),
    )
    if envoxer_id is not None:
        ativos_stmt = ativos_stmt.where(RegistroFoco.envoxer_id == envoxer_id)
    ativos_ids = set((await db.execute(ativos_stmt)).scalars().all())

    pessoas = defaultdict(lambda: {
        "total_min": 0,
        "sessoes": 0,
        "dias": set(),
        "origens": defaultdict(int),
        "ajustados": 0,
        "ultimo_inicio": None,
        "env": None,
    })
    por_origem = defaultdict(lambda: {"min": 0, "sessoes": 0})
    por_contexto = defaultdict(lambda: {"min": 0, "sessoes": 0})
    por_dia = defaultdict(lambda: {"min": 0, "sessoes": 0, "pessoas": set()})

    registros_saida = []
    total_min = 0
    dias_gerais = set()

    for item in registros_base:
        reg = item["registro"]
        env = item["envoxer"]
        reg_origem = item["origem"]
        duracao = int(reg.duracao_min or 0)
        data_local = reg.inicio.astimezone(TZ_LOCAL).date()
        total_min += duracao
        dias_gerais.add(data_local)

        p = pessoas[env.id]
        p["env"] = env
        p["total_min"] += duracao
        p["sessoes"] += 1
        p["dias"].add(data_local)
        p["origens"][reg_origem] += duracao
        p["ajustados"] += 1 if reg.id in ajustados_ids else 0
        if p["ultimo_inicio"] is None or reg.inicio > p["ultimo_inicio"]:
            p["ultimo_inicio"] = reg.inicio

        por_origem[reg_origem]["min"] += duracao
        por_origem[reg_origem]["sessoes"] += 1

        contexto_nome = (item["contexto"] or "Sem contexto").strip()
        ctx_key = (reg_origem, contexto_nome)
        por_contexto[ctx_key]["min"] += duracao
        por_contexto[ctx_key]["sessoes"] += 1

        por_dia[data_local]["min"] += duracao
        por_dia[data_local]["sessoes"] += 1
        por_dia[data_local]["pessoas"].add(env.id)

        registros_saida.append(FocoRelatorioRegistro(
            id=reg.id,
            envoxer_id=env.id,
            envoxer_nome=env.nome,
            origem=reg_origem,
            contexto=item["contexto"],
            titulo=item["titulo"],
            inicio=reg.inicio,
            fim=reg.fim,
            duracao_min=duracao,
            duracao_pausada_min=int(reg.duracao_pausada_min or 0),
            comentario=reg.comentario,
            ajustado=reg.id in ajustados_ids,
        ))

    equipe = []
    for env_id, data in pessoas.items():
        env = data["env"]
        dias_count = len(data["dias"])
        sessoes = data["sessoes"]
        equipe.append(FocoRelatorioPessoa(
            envoxer_id=env_id,
            nome=env.nome,
            cargo=env.cargo,
            foto_url=env.foto_url,
            total_min=data["total_min"],
            sessoes=sessoes,
            dias_com_foco=dias_count,
            media_dia_min=round(data["total_min"] / dias_count, 1) if dias_count else 0,
            media_sessao_min=round(data["total_min"] / sessoes, 1) if sessoes else 0,
            operacao_min=data["origens"]["operacao"],
            comercial_min=data["origens"]["comercial"],
            avulsa_min=data["origens"]["avulsa"],
            registros_ajustados=data["ajustados"],
            ultimo_inicio=data["ultimo_inicio"],
            ativo_agora=env_id in ativos_ids,
        ))
    equipe.sort(key=lambda x: (-x.total_min, x.nome.lower()))

    origens = []
    for key in ("operacao", "comercial", "avulsa"):
        data = por_origem[key]
        origens.append(FocoRelatorioOrigem(
            origem=key,
            label=ORIGEM_LABEL[key],
            total_min=data["min"],
            sessoes=data["sessoes"],
            percentual=round(data["min"] / total_min * 100, 1) if total_min else 0,
        ))

    contextos = [
        FocoRelatorioContexto(
            contexto=ctx,
            origem=orig,
            total_min=data["min"],
            sessoes=data["sessoes"],
            percentual=round(data["min"] / total_min * 100, 1) if total_min else 0,
        )
        for (orig, ctx), data in por_contexto.items()
    ]
    contextos.sort(key=lambda x: (-x.total_min, x.contexto.lower()))

    dias = [
        FocoRelatorioDia(
            data=d,
            total_min=data["min"],
            sessoes=data["sessoes"],
            pessoas=len(data["pessoas"]),
        )
        for d, data in sorted(por_dia.items())
    ]

    opcoes_stmt = select(Envoxer.id, Envoxer.nome).where(
        Envoxer.deleted_at.is_(None)
    ).order_by(Envoxer.nome)
    pessoas_opcoes = [
        FocoRelatorioPessoaOpcao(id=row.id, nome=row.nome)
        for row in (await db.execute(opcoes_stmt)).all()
    ]

    total_sessoes = len(registros_saida)
    resumo = FocoRelatorioResumo(
        periodo_inicio=inicio_local,
        periodo_fim=fim_local,
        total_min=total_min,
        total_sessoes=total_sessoes,
        pessoas_com_foco=len(pessoas),
        dias_com_registro=len(dias_gerais),
        media_sessao_min=round(total_min / total_sessoes, 1) if total_sessoes else 0,
        media_dia_min=round(total_min / len(dias_gerais), 1) if dias_gerais else 0,
        registros_ajustados=len(ajustados_ids),
        ativos_agora=len(ativos_ids),
    )

    return FocoRelatorioResponse(
        resumo=resumo,
        equipe=equipe,
        origens=origens,
        contextos=contextos,
        dias=dias,
        registros=registros_saida[:1000],
        pessoas_opcoes=pessoas_opcoes,
    )

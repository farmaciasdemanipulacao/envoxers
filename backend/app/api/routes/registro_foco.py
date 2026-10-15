from datetime import datetime, date, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.tarefa import Tarefa
from app.models.registro_foco import RegistroFoco
from app.models.comercial import ComercialTask, ComercialLead
from app.models.demanda_avulsa import DemandaAvulsa
from app.schemas.registro_foco import (
    FocoIniciarRequest,
    FocoFinalizarRequest,
    RegistroFocoResponse,
    FocoResumoResponse,
    FocoAtivoItem,
    FocoOfflineItem,
    FocoStatusTimeResponse,
)
from app.core.valores import redigir

router = APIRouter(prefix="/foco", tags=["foco"])

# "meta média" de horas de Foco por semana, exibida no widget "Meu Foco" (ver wireframe F1).
META_SEMANAL_MIN = 32 * 60

# Regra atual: todo Foco conta, mesmo com poucos segundos.
GRACE_PERIOD_SEGUNDOS = 0


async def _sessao_ativa(db: AsyncSession, envoxer_id: int) -> Optional[RegistroFoco]:
    result = await db.execute(
        select(RegistroFoco).where(and_(RegistroFoco.envoxer_id == envoxer_id, RegistroFoco.fim.is_(None)))
    )
    return result.scalar_one_or_none()


async def _contexto_registro(db: AsyncSession, registro: RegistroFoco):
    if registro.tarefa_id is not None:
        tarefa = (await db.execute(select(Tarefa).where(Tarefa.id == registro.tarefa_id))).scalar_one_or_none()
        cliente_nome = None
        if tarefa is not None:
            cliente = (await db.execute(select(Cliente).where(Cliente.id == tarefa.cliente_id))).scalar_one_or_none()
            cliente_nome = cliente.nome if cliente else None
        return {
            "origem": "operacao",
            "tarefa_id": registro.tarefa_id,
            "comercial_task_id": None,
            "demanda_avulsa_id": None,
            "lead_id": None,
            "titulo": tarefa.titulo if tarefa else None,
            "status": tarefa.status if tarefa else None,
            "contexto": cliente_nome,
        }

    if registro.comercial_task_id is not None:
        row = (await db.execute(
            select(ComercialTask, ComercialLead)
            .join(ComercialLead, ComercialLead.id == ComercialTask.lead_id)
            .where(ComercialTask.id == registro.comercial_task_id)
        )).first()
        if row:
            task, lead = row
            return {
                "origem": "comercial",
                "tarefa_id": None,
                "comercial_task_id": task.id,
                "demanda_avulsa_id": None,
                "lead_id": lead.id,
                "titulo": task.titulo,
                "status": task.status,
                "contexto": lead.nome_estabelecimento,
            }

    if registro.demanda_avulsa_id is not None:
        item = (await db.execute(
            select(DemandaAvulsa).where(DemandaAvulsa.id == registro.demanda_avulsa_id)
        )).scalar_one_or_none()
        if item:
            return {
                "origem": "avulsa",
                "tarefa_id": None,
                "comercial_task_id": None,
                "demanda_avulsa_id": item.id,
                "lead_id": None,
                "titulo": item.titulo,
                "status": item.status,
                "contexto": item.contexto,
            }

    return {
        "origem": "operacao",
        "tarefa_id": registro.tarefa_id,
        "comercial_task_id": registro.comercial_task_id,
        "demanda_avulsa_id": registro.demanda_avulsa_id,
        "lead_id": None,
        "titulo": None,
        "status": None,
        "contexto": None,
    }


async def _to_response(db: AsyncSession, registro: RegistroFoco, envoxer: Envoxer) -> RegistroFocoResponse:
    ctx = await _contexto_registro(db, registro)
    resp = RegistroFocoResponse(
        id=registro.id,
        tarefa_id=ctx["tarefa_id"],
        comercial_task_id=ctx["comercial_task_id"],
        demanda_avulsa_id=ctx.get("demanda_avulsa_id"),
        origem=ctx["origem"],
        lead_id=ctx["lead_id"],
        tarefa_titulo=ctx["titulo"],
        tarefa_status=ctx["status"],
        cliente_nome=ctx["contexto"],
        inicio=registro.inicio,
        fim=registro.fim,
        duracao_min=((registro.duracao_segundos if registro.duracao_segundos is not None else int(registro.duracao_min or 0) * 60) / 60),
        duracao_segundos=registro.duracao_segundos,
        custo=float(registro.custo) if registro.custo is not None else None,
        pausado_em=registro.pausado_em,
        duracao_pausada_min=((registro.duracao_pausada_segundos or 0) / 60),
        duracao_pausada_segundos=int(registro.duracao_pausada_segundos or 0),
        comentario=registro.comentario,
        descartado=registro.descartado,
    )
    redigir(resp, ["custo"], envoxer)
    return resp


@router.get("/ativo", response_model=Optional[RegistroFocoResponse])
async def obter_foco_ativo(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    registro = await _sessao_ativa(db, envoxer.id)
    if registro is None:
        return None
    return await _to_response(db, registro, envoxer)


@router.post("/iniciar", response_model=RegistroFocoResponse, status_code=201)
async def iniciar_foco(
    payload: FocoIniciarRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    refs = [payload.tarefa_id, payload.comercial_task_id, payload.demanda_avulsa_id]
    if sum(x is not None for x in refs) != 1:
        raise HTTPException(status_code=400, detail="Informe exatamente uma tarefa operacional, comercial ou demanda avulsa")

    ativo = await _sessao_ativa(db, envoxer.id)
    if ativo is not None:
        ctx = await _contexto_registro(db, ativo)
        raise HTTPException(
            status_code=409,
            detail=f'Você já está em Foco em "{ctx["titulo"] or "outra tarefa"}". Finalize antes de iniciar outro.',
        )

    if payload.tarefa_id is not None:
        tarefa = (await db.execute(select(Tarefa).where(Tarefa.id == payload.tarefa_id))).scalar_one_or_none()
        if tarefa is None:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")
        registro = RegistroFoco(
            envoxer_id=envoxer.id,
            tarefa_id=payload.tarefa_id,
            comercial_task_id=None,
            demanda_avulsa_id=None,
            inicio=datetime.now(timezone.utc),
        )
    elif payload.comercial_task_id is not None:
        task = (await db.execute(select(ComercialTask).where(ComercialTask.id == payload.comercial_task_id))).scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=404, detail="Tarefa comercial não encontrada")
        registro = RegistroFoco(
            envoxer_id=envoxer.id,
            tarefa_id=None,
            comercial_task_id=payload.comercial_task_id,
            demanda_avulsa_id=None,
            inicio=datetime.now(timezone.utc),
        )
    else:
        item = (await db.execute(
            select(DemandaAvulsa).where(
                DemandaAvulsa.id == payload.demanda_avulsa_id,
                DemandaAvulsa.deleted_at.is_(None),
            )
        )).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Demanda avulsa não encontrada")
        registro = RegistroFoco(
            envoxer_id=envoxer.id,
            tarefa_id=None,
            comercial_task_id=None,
            demanda_avulsa_id=payload.demanda_avulsa_id,
            inicio=datetime.now(timezone.utc),
        )

    db.add(registro)
    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro, envoxer)


async def _obter_registro_do_envoxer(db: AsyncSession, registro_id: int, envoxer_id: int) -> RegistroFoco:
    result = await db.execute(
        select(RegistroFoco).where(and_(RegistroFoco.id == registro_id, RegistroFoco.envoxer_id == envoxer_id))
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        raise HTTPException(status_code=404, detail="Registro de Foco não encontrado")
    return registro


@router.post("/{registro_id}/pausar", response_model=RegistroFocoResponse)
async def pausar_ou_retomar_foco(
    registro_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Toggle: pausa se estiver rodando, retoma se já estiver pausado."""
    registro = await _obter_registro_do_envoxer(db, registro_id, envoxer.id)
    if registro.fim is not None:
        raise HTTPException(status_code=409, detail="Este Foco já foi finalizado")

    agora = datetime.now(timezone.utc)
    if registro.pausado_em is None:
        registro.pausado_em = agora
    else:
        segundos_pausado = max(0, int(round((agora - registro.pausado_em).total_seconds())))
        registro.duracao_pausada_segundos = int(registro.duracao_pausada_segundos or 0) + segundos_pausado
        registro.duracao_pausada_min = round(registro.duracao_pausada_segundos / 60)
        registro.pausado_em = None

    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro, envoxer)


def _finalizar_registro(registro: RegistroFoco, custo_hora: float, comentario: Optional[str] = None) -> None:
    """Finaliza usando segundos reais. Nenhuma sessão é descartada por ser curta."""
    registro.comentario = comentario
    registro.fim = datetime.now(timezone.utc)

    if registro.pausado_em is not None:
        segundos_pausado = max(0, int(round((registro.fim - registro.pausado_em).total_seconds())))
        registro.duracao_pausada_segundos = int(registro.duracao_pausada_segundos or 0) + segundos_pausado
        registro.pausado_em = None

    bruto_segundos = max(0, int(round((registro.fim - registro.inicio).total_seconds())))
    pausado_segundos = max(0, int(registro.duracao_pausada_segundos or 0))
    liquido_segundos = max(bruto_segundos - pausado_segundos, 0)

    registro.duracao_segundos = liquido_segundos
    registro.duracao_pausada_min = round(pausado_segundos / 60)
    registro.duracao_min = round(liquido_segundos / 60)
    registro.custo_hora_snapshot = custo_hora
    registro.custo = round((liquido_segundos / 3600) * float(custo_hora or 0), 2)
    registro.descartado = False


async def finalizar_foco_ativo_da_tarefa(
    db: AsyncSession, tarefa_id: int, comentario: Optional[str] = None
) -> Optional[RegistroFoco]:
    """Chamado ao excluir uma Tarefa — nunca deixar um RegistroFoco "fantasma" ativo
    indefinidamente (travaria `/foco/iniciar` pro envoxer dono da sessão pra sempre)."""
    result = await db.execute(
        select(RegistroFoco).where(and_(RegistroFoco.tarefa_id == tarefa_id, RegistroFoco.fim.is_(None)))
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        return None

    dono = (await db.execute(select(Envoxer).where(Envoxer.id == registro.envoxer_id))).scalar_one_or_none()
    custo_hora = dono.custo_hora if dono is not None else 0
    _finalizar_registro(registro, custo_hora, comentario)
    await db.flush()
    return registro


async def finalizar_foco_ativo_da_demanda_avulsa(
    db: AsyncSession, demanda_avulsa_id: int, comentario: Optional[str] = None
) -> Optional[RegistroFoco]:
    result = await db.execute(
        select(RegistroFoco).where(and_(
            RegistroFoco.demanda_avulsa_id == demanda_avulsa_id,
            RegistroFoco.fim.is_(None),
        ))
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        return None
    dono = (await db.execute(select(Envoxer).where(Envoxer.id == registro.envoxer_id))).scalar_one_or_none()
    _finalizar_registro(registro, dono.custo_hora if dono is not None else 0, comentario)
    await db.flush()
    return registro


async def finalizar_foco_ativo_do_envoxer(
    db: AsyncSession, envoxer_id: int, comentario: Optional[str] = None
) -> Optional[RegistroFoco]:
    """Chamado ao desativar um Envoxer com substituto (troca de pessoa) — nunca deixar
    um Foco "fantasma" ativo em nome de alguém que saiu."""
    result = await db.execute(
        select(RegistroFoco).where(and_(RegistroFoco.envoxer_id == envoxer_id, RegistroFoco.fim.is_(None)))
    )
    registro = result.scalar_one_or_none()
    if registro is None:
        return None

    envoxer = (await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))).scalar_one_or_none()
    custo_hora = envoxer.custo_hora if envoxer is not None else 0
    _finalizar_registro(registro, custo_hora, comentario)
    await db.flush()
    return registro


def _tempo_ativo_segundos_agora(registro: RegistroFoco) -> float:
    agora = datetime.now(timezone.utc)
    referencia = registro.pausado_em or agora
    bruto = max(0.0, (referencia - registro.inicio).total_seconds())
    pausas = max(0, int(registro.duracao_pausada_segundos or 0))
    return max(0.0, bruto - pausas)


@router.post("/{registro_id}/finalizar", response_model=RegistroFocoResponse)
async def finalizar_foco(
    registro_id: int,
    payload: FocoFinalizarRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    registro = await _obter_registro_do_envoxer(db, registro_id, envoxer.id)
    if registro.fim is not None:
        raise HTTPException(status_code=409, detail="Este Foco já foi finalizado")

    comentario = (payload.comentario or "").strip() or None
    if _tempo_ativo_segundos_agora(registro) > 300 and not comentario:
        raise HTTPException(
            status_code=422,
            detail="A observação é obrigatória para Focos com mais de 5 minutos",
        )

    _finalizar_registro(registro, envoxer.custo_hora, comentario)

    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro, envoxer)


@router.get("/resumo", response_model=FocoResumoResponse)
async def resumo_foco(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    hoje = date.today()
    inicio_hoje = datetime.combine(hoje, datetime.min.time(), tzinfo=timezone.utc)
    fim_hoje = inicio_hoje + timedelta(days=1)

    inicio_semana = datetime.combine(hoje - timedelta(days=hoje.weekday()), datetime.min.time(), tzinfo=timezone.utc)
    fim_semana = inicio_semana + timedelta(days=7)

    hoje_stmt = select(
        func.coalesce(func.sum(RegistroFoco.duracao_segundos), 0),
        func.coalesce(func.sum(RegistroFoco.custo), 0),
        func.count(RegistroFoco.id),
    ).where(and_(
        RegistroFoco.envoxer_id == envoxer.id,
        RegistroFoco.fim.is_not(None),
        RegistroFoco.descartado.is_(False),
        RegistroFoco.inicio >= inicio_hoje,
        RegistroFoco.inicio < fim_hoje,
    ))
    hoje_segundos, hoje_custo, hoje_sessoes = (await db.execute(hoje_stmt)).one()

    semana_stmt = select(
        func.coalesce(func.sum(RegistroFoco.duracao_segundos), 0),
    ).where(and_(
        RegistroFoco.envoxer_id == envoxer.id,
        RegistroFoco.fim.is_not(None),
        RegistroFoco.descartado.is_(False),
        RegistroFoco.inicio >= inicio_semana,
        RegistroFoco.inicio < fim_semana,
    ))
    (semana_segundos,) = (await db.execute(semana_stmt)).one()

    hoje_segundos = int(hoje_segundos or 0)
    semana_segundos = int(semana_segundos or 0)
    resposta = FocoResumoResponse(
        hoje_min=hoje_segundos / 60,
        hoje_segundos=hoje_segundos,
        hoje_custo=float(hoje_custo),
        hoje_sessoes=int(hoje_sessoes),
        semana_min=semana_segundos / 60,
        semana_segundos=semana_segundos,
        semana_meta_min=META_SEMANAL_MIN,
    )
    redigir(resposta, ["hoje_custo"], envoxer)
    return resposta


@router.get("/status", response_model=FocoStatusTimeResponse)
async def status_foco_time(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(RegistroFoco, Envoxer)
        .join(Envoxer, Envoxer.id == RegistroFoco.envoxer_id)
        .where(RegistroFoco.fim.is_(None))
        .order_by(RegistroFoco.inicio)
    )
    ativos = []
    for registro, env in result.all():
        ctx = await _contexto_registro(db, registro)
        ativos.append(FocoAtivoItem(
            envoxer_id=env.id,
            envoxer_nome=env.nome,
            envoxer_foto=env.foto_url,
            tarefa_id=ctx["tarefa_id"],
            comercial_task_id=ctx["comercial_task_id"],
            demanda_avulsa_id=ctx.get("demanda_avulsa_id"),
            origem=ctx["origem"],
            tarefa_titulo=ctx["titulo"],
            cliente_nome=ctx["contexto"],
            inicio=registro.inicio,
            pausado_em=registro.pausado_em,
        ))
    ativos_ids = {item.envoxer_id for item in ativos}

    todos_result = await db.execute(
        select(Envoxer).where(Envoxer.ativo.is_(True), Envoxer.deleted_at.is_(None)).order_by(Envoxer.nome)
    )
    offline: list[FocoOfflineItem] = []
    for env in todos_result.scalars().all():
        if env.id in ativos_ids:
            continue
        ultimo_registro = (await db.execute(
            select(RegistroFoco)
            .where(RegistroFoco.envoxer_id == env.id, RegistroFoco.fim.is_not(None))
            .order_by(RegistroFoco.fim.desc())
            .limit(1)
        )).scalar_one_or_none()
        if ultimo_registro is None:
            offline.append(FocoOfflineItem(envoxer_id=env.id, envoxer_nome=env.nome, envoxer_foto=env.foto_url))
            continue
        ctx = await _contexto_registro(db, ultimo_registro)
        offline.append(FocoOfflineItem(
            envoxer_id=env.id,
            envoxer_nome=env.nome,
            envoxer_foto=env.foto_url,
            ultimo_tarefa_titulo=ctx["titulo"],
            ultimo_cliente_nome=ctx["contexto"],
            ultimo_inicio=ultimo_registro.inicio,
            ultimo_fim=ultimo_registro.fim,
        ))

    return FocoStatusTimeResponse(ativos=ativos, offline=offline)

from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.cliente import Cliente
from app.models.comercial import ComercialLead, ComercialTask
from app.models.demanda_avulsa import DemandaAvulsa
from app.models.envoxer import Envoxer
from app.models.foco_ajuste import FocoAjuste
from app.models.registro_foco import RegistroFoco
from app.models.tarefa import Tarefa
from app.schemas.foco_ajuste import (
    FocoAjusteCreate, FocoAjusteDecisao, FocoAjusteResponse,
    FocoOpcao, FocoRegistroRecente,
)
from app.api.routes.registro_foco import _contexto_registro

router = APIRouter(prefix="/foco/ajustes", tags=["foco-ajustes"])


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _validar_periodo(inicio: datetime, fim: datetime) -> tuple[datetime, datetime]:
    inicio = _utc(inicio)
    fim = _utc(fim)
    if fim <= inicio:
        raise HTTPException(status_code=422, detail="O fim precisa ser posterior ao início")
    if fim - inicio > timedelta(hours=24):
        raise HTTPException(status_code=422, detail="Um apontamento não pode ultrapassar 24 horas")
    if fim > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="O fim do apontamento não pode estar no futuro")
    return inicio, fim


def _aplicar_periodo(registro: RegistroFoco, inicio: datetime, fim: datetime, custo_hora: float, *, valido: bool) -> None:
    registro.inicio = inicio
    registro.fim = fim
    registro.pausado_em = None
    registro.duracao_pausada_min = 0
    minutos = max(0, round((fim - inicio).total_seconds() / 60))
    registro.duracao_min = minutos
    registro.custo_hora_snapshot = custo_hora
    registro.custo = round((minutos / 60) * float(custo_hora or 0), 2)
    # Enquanto aguarda aprovação o registro fica fora de relatórios/custos.
    registro.descartado = not valido


async def _label_contexto_avulso(db: AsyncSession, ajuste: FocoAjuste) -> str:
    if ajuste.registro_foco_id:
        reg = await db.get(RegistroFoco, ajuste.registro_foco_id)
        if reg:
            ctx = await _contexto_registro(db, reg)
            return " · ".join(x for x in (ctx.get("contexto"), ctx.get("titulo")) if x) or "Foco"
    if ajuste.tarefa_id:
        row = (await db.execute(
            select(Tarefa.titulo, Cliente.nome)
            .join(Cliente, Cliente.id == Tarefa.cliente_id)
            .where(Tarefa.id == ajuste.tarefa_id)
        )).first()
        if row:
            return f"{row[1]} · {row[0]}"
    if ajuste.comercial_task_id:
        row = (await db.execute(
            select(ComercialTask.titulo, ComercialLead.nome_estabelecimento)
            .join(ComercialLead, ComercialLead.id == ComercialTask.lead_id)
            .where(ComercialTask.id == ajuste.comercial_task_id)
        )).first()
        if row:
            return f"{row[1]} · {row[0]}"
    if ajuste.demanda_avulsa_id:
        item = await db.get(DemandaAvulsa, ajuste.demanda_avulsa_id)
        if item:
            return f"{item.contexto} · {item.titulo}"
    return "Contexto não encontrado"


async def _serialize(db: AsyncSession, ajuste: FocoAjuste) -> FocoAjusteResponse:
    ids = [x for x in (ajuste.envoxer_id, ajuste.decidido_por_envoxer_id) if x]
    pessoas = {}
    if ids:
        pessoas = {e.id: e.nome for e in (await db.execute(select(Envoxer).where(Envoxer.id.in_(ids)))).scalars().all()}
    return FocoAjusteResponse(
        id=ajuste.id,
        envoxer_id=ajuste.envoxer_id,
        envoxer_nome=pessoas.get(ajuste.envoxer_id),
        registro_foco_id=ajuste.registro_foco_id,
        tarefa_id=ajuste.tarefa_id,
        comercial_task_id=ajuste.comercial_task_id,
        demanda_avulsa_id=ajuste.demanda_avulsa_id,
        contexto_label=await _label_contexto_avulso(db, ajuste),
        inicio_solicitado=ajuste.inicio_solicitado,
        fim_solicitado=ajuste.fim_solicitado,
        motivo=ajuste.motivo,
        status=ajuste.status,
        era_ativo=ajuste.era_ativo,
        decidido_por_envoxer_id=ajuste.decidido_por_envoxer_id,
        decidido_por_nome=pessoas.get(ajuste.decidido_por_envoxer_id),
        decidido_em=ajuste.decidido_em,
        observacao_gestor=ajuste.observacao_gestor,
        created_at=ajuste.created_at,
    )


async def _validar_contexto_novo(db: AsyncSession, payload: FocoAjusteCreate) -> None:
    refs = [payload.tarefa_id, payload.comercial_task_id, payload.demanda_avulsa_id]
    if sum(x is not None for x in refs) != 1:
        raise HTTPException(status_code=422, detail="Escolha exatamente um contexto para o apontamento")
    if payload.tarefa_id is not None:
        item = (await db.execute(select(Tarefa).where(Tarefa.id == payload.tarefa_id, Tarefa.deleted_at.is_(None)))).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Card não encontrado")
    elif payload.comercial_task_id is not None:
        if await db.get(ComercialTask, payload.comercial_task_id) is None:
            raise HTTPException(status_code=404, detail="Tarefa comercial não encontrada")
    elif payload.demanda_avulsa_id is not None:
        item = (await db.execute(select(DemandaAvulsa).where(DemandaAvulsa.id == payload.demanda_avulsa_id, DemandaAvulsa.deleted_at.is_(None)))).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail="Demanda avulsa não encontrada")


@router.get("/minhas", response_model=list[FocoAjusteResponse])
async def minhas(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    itens = list((await db.execute(
        select(FocoAjuste).where(FocoAjuste.envoxer_id == envoxer.id).order_by(FocoAjuste.created_at.desc()).limit(100)
    )).scalars().all())
    return [await _serialize(db, x) for x in itens]


@router.get("/pendentes", response_model=list[FocoAjusteResponse])
async def pendentes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    itens = list((await db.execute(
        select(FocoAjuste).where(FocoAjuste.status == "pendente").order_by(FocoAjuste.created_at)
    )).scalars().all())
    return [await _serialize(db, x) for x in itens]


@router.get("/recentes", response_model=list[FocoRegistroRecente])
async def recentes(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    itens = list((await db.execute(
        select(RegistroFoco)
        .where(RegistroFoco.envoxer_id == envoxer.id)
        .order_by(RegistroFoco.inicio.desc())
        .limit(30)
    )).scalars().all())
    out = []
    for item in itens:
        ctx = await _contexto_registro(db, item)
        label = " · ".join(x for x in (ctx.get("contexto"), ctx.get("titulo")) if x) or "Foco"
        out.append(FocoRegistroRecente(
            id=item.id,
            label=label,
            inicio=item.inicio,
            fim=item.fim,
            ativo=item.fim is None,
            descartado=item.descartado,
        ))
    return out


@router.get("/opcoes", response_model=list[FocoOpcao])
async def opcoes(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    out: list[FocoOpcao] = []

    if envoxer.permissao != "comercial":
        rows = (await db.execute(
            select(Tarefa, Cliente.nome)
            .join(Cliente, Cliente.id == Tarefa.cliente_id)
            .where(Tarefa.deleted_at.is_(None), Tarefa.status != "finalizado")
            .order_by(Cliente.nome, Tarefa.titulo)
            .limit(250)
        )).all()
        out.extend(FocoOpcao(tipo="operacao", id=t.id, label=t.titulo, contexto=cliente) for t, cliente in rows)

        avulsas = list((await db.execute(
            select(DemandaAvulsa)
            .where(DemandaAvulsa.deleted_at.is_(None), DemandaAvulsa.status != "concluida")
            .order_by(DemandaAvulsa.contexto, DemandaAvulsa.titulo)
            .limit(250)
        )).scalars().all())
        out.extend(FocoOpcao(tipo="avulsa", id=x.id, label=x.titulo, contexto=x.contexto) for x in avulsas)

    if envoxer.permissao in ("admin", "gestor", "comercial"):
        stmt = (
            select(ComercialTask, ComercialLead.nome_estabelecimento)
            .join(ComercialLead, ComercialLead.id == ComercialTask.lead_id)
            .where(ComercialTask.status != "concluida", ComercialLead.deleted_at.is_(None))
        )
        if envoxer.permissao == "comercial":
            stmt = stmt.where(ComercialTask.responsavel_envoxer_id == envoxer.id)
        rows = (await db.execute(stmt.order_by(ComercialTask.prazo.asc().nullslast()).limit(250))).all()
        out.extend(FocoOpcao(tipo="comercial", id=t.id, label=t.titulo, contexto=lead) for t, lead in rows)

    return out


@router.post("", response_model=FocoAjusteResponse, status_code=201)
async def solicitar(
    payload: FocoAjusteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    inicio, fim = _validar_periodo(payload.inicio_solicitado, payload.fim_solicitado)
    motivo = payload.motivo.strip()
    if payload.registro_foco_id is not None:
        registro = (await db.execute(
            select(RegistroFoco).where(
                RegistroFoco.id == payload.registro_foco_id,
                RegistroFoco.envoxer_id == envoxer.id,
            )
        )).scalar_one_or_none()
        if registro is None:
            raise HTTPException(status_code=404, detail="Registro de Foco não encontrado")
        ja_pendente = (await db.execute(
            select(FocoAjuste).where(
                FocoAjuste.registro_foco_id == registro.id,
                FocoAjuste.status == "pendente",
            )
        )).scalar_one_or_none()
        if ja_pendente:
            raise HTTPException(status_code=409, detail="Já existe um ajuste pendente para este Foco")
        era_ativo = registro.fim is None
        ajuste = FocoAjuste(
            envoxer_id=envoxer.id,
            registro_foco_id=registro.id,
            inicio_solicitado=inicio,
            fim_solicitado=fim,
            motivo=motivo,
            status="pendente",
            era_ativo=era_ativo,
        )
        db.add(ajuste)
        if era_ativo:
            # Libera a pessoa para trabalhar em outro Foco sem validar tempo incorreto.
            _aplicar_periodo(registro, inicio, fim, float(envoxer.custo_hora or 0), valido=False)
    else:
        await _validar_contexto_novo(db, payload)
        ajuste = FocoAjuste(
            envoxer_id=envoxer.id,
            tarefa_id=payload.tarefa_id,
            comercial_task_id=payload.comercial_task_id,
            demanda_avulsa_id=payload.demanda_avulsa_id,
            inicio_solicitado=inicio,
            fim_solicitado=fim,
            motivo=motivo,
            status="pendente",
            era_ativo=False,
        )
        db.add(ajuste)

    await db.flush()
    await db.refresh(ajuste)
    return await _serialize(db, ajuste)


@router.post("/{ajuste_id}/decidir", response_model=FocoAjusteResponse)
async def decidir(
    ajuste_id: int,
    payload: FocoAjusteDecisao,
    db: Annotated[AsyncSession, Depends(get_db)],
    gestor: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    if payload.decisao not in ("aprovar", "rejeitar"):
        raise HTTPException(status_code=422, detail="Decisão precisa ser aprovar ou rejeitar")
    ajuste = await db.get(FocoAjuste, ajuste_id)
    if ajuste is None:
        raise HTTPException(status_code=404, detail="Solicitação de ajuste não encontrada")
    if ajuste.status != "pendente":
        raise HTTPException(status_code=409, detail="Este ajuste já foi decidido")
    if gestor.permissao == "gestor" and ajuste.envoxer_id == gestor.id:
        raise HTTPException(status_code=403, detail="Gestor não pode aprovar o próprio ajuste; um admin precisa validar")

    dono = await db.get(Envoxer, ajuste.envoxer_id)
    if dono is None:
        raise HTTPException(status_code=404, detail="Envoxer do ajuste não encontrado")

    if payload.decisao == "aprovar":
        if ajuste.registro_foco_id:
            registro = await db.get(RegistroFoco, ajuste.registro_foco_id)
            if registro is None:
                raise HTTPException(status_code=404, detail="Registro de Foco não encontrado")
            _aplicar_periodo(
                registro,
                ajuste.inicio_solicitado,
                ajuste.fim_solicitado,
                float(dono.custo_hora or 0),
                valido=True,
            )
        else:
            registro = RegistroFoco(
                envoxer_id=ajuste.envoxer_id,
                tarefa_id=ajuste.tarefa_id,
                comercial_task_id=ajuste.comercial_task_id,
                demanda_avulsa_id=ajuste.demanda_avulsa_id,
                inicio=ajuste.inicio_solicitado,
                fim=ajuste.fim_solicitado,
                duracao_pausada_min=0,
                comentario=f"Apontamento manual aprovado · {ajuste.motivo}",
                descartado=False,
            )
            _aplicar_periodo(
                registro,
                ajuste.inicio_solicitado,
                ajuste.fim_solicitado,
                float(dono.custo_hora or 0),
                valido=True,
            )
            db.add(registro)
            await db.flush()
            ajuste.registro_foco_id = registro.id
        ajuste.status = "aprovado"
    else:
        ajuste.status = "rejeitado"

    ajuste.decidido_por_envoxer_id = gestor.id
    ajuste.decidido_em = datetime.now(timezone.utc)
    ajuste.observacao_gestor = (payload.observacao_gestor or "").strip() or None
    await db.flush()
    await db.refresh(ajuste)
    return await _serialize(db, ajuste)

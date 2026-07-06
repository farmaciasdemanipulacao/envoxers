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
from app.schemas.registro_foco import (
    FocoIniciarRequest,
    FocoFinalizarRequest,
    RegistroFocoResponse,
    FocoResumoResponse,
)

router = APIRouter(prefix="/foco", tags=["foco"])

# "meta média" de horas de Foco por semana, exibida no widget "Meu Foco" (ver wireframe F1).
META_SEMANAL_MIN = 32 * 60

# Grace period — Foco iniciado e finalizado em menos disso é "abriu por engano" (ver TaskModal).
GRACE_PERIOD_SEGUNDOS = 120


async def _sessao_ativa(db: AsyncSession, envoxer_id: int) -> Optional[RegistroFoco]:
    result = await db.execute(
        select(RegistroFoco).where(and_(RegistroFoco.envoxer_id == envoxer_id, RegistroFoco.fim.is_(None)))
    )
    return result.scalar_one_or_none()


async def _to_response(db: AsyncSession, registro: RegistroFoco) -> RegistroFocoResponse:
    tarefa = (await db.execute(select(Tarefa).where(Tarefa.id == registro.tarefa_id))).scalar_one_or_none()
    cliente_nome = None
    if tarefa is not None:
        cliente = (await db.execute(select(Cliente).where(Cliente.id == tarefa.cliente_id))).scalar_one_or_none()
        cliente_nome = cliente.nome if cliente else None

    return RegistroFocoResponse(
        id=registro.id,
        tarefa_id=registro.tarefa_id,
        tarefa_titulo=tarefa.titulo if tarefa else None,
        tarefa_status=tarefa.status if tarefa else None,
        cliente_nome=cliente_nome,
        inicio=registro.inicio,
        fim=registro.fim,
        duracao_min=registro.duracao_min,
        custo=float(registro.custo) if registro.custo is not None else None,
        pausado_em=registro.pausado_em,
        duracao_pausada_min=registro.duracao_pausada_min,
        comentario=registro.comentario,
        descartado=registro.descartado,
    )


@router.get("/ativo", response_model=Optional[RegistroFocoResponse])
async def obter_foco_ativo(
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    registro = await _sessao_ativa(db, envoxer.id)
    if registro is None:
        return None
    return await _to_response(db, registro)


@router.post("/iniciar", response_model=RegistroFocoResponse, status_code=201)
async def iniciar_foco(
    payload: FocoIniciarRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    ativo = await _sessao_ativa(db, envoxer.id)
    if ativo is not None:
        tarefa_ativa = (await db.execute(select(Tarefa).where(Tarefa.id == ativo.tarefa_id))).scalar_one_or_none()
        raise HTTPException(
            status_code=409,
            detail=f"Você já está em Foco em \"{tarefa_ativa.titulo if tarefa_ativa else 'outra tarefa'}\". Finalize antes de iniciar outro.",
        )

    tarefa = (await db.execute(select(Tarefa).where(Tarefa.id == payload.tarefa_id))).scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    registro = RegistroFoco(envoxer_id=envoxer.id, tarefa_id=payload.tarefa_id, inicio=datetime.now(timezone.utc))
    db.add(registro)
    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro)


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
        segundos_pausado = (agora - registro.pausado_em).total_seconds()
        registro.duracao_pausada_min += round(segundos_pausado / 60)
        registro.pausado_em = None

    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro)


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

    registro.comentario = payload.comentario
    registro.fim = datetime.now(timezone.utc)

    # Se estava pausado no momento de finalizar, fecha esse último intervalo antes de calcular.
    if registro.pausado_em is not None:
        segundos_pausado = (registro.fim - registro.pausado_em).total_seconds()
        registro.duracao_pausada_min += round(segundos_pausado / 60)
        registro.pausado_em = None

    duracao_segundos = (registro.fim - registro.inicio).total_seconds()
    duracao_min = round(duracao_segundos / 60) - registro.duracao_pausada_min
    registro.duracao_min = max(duracao_min, 0)
    registro.custo_hora_snapshot = envoxer.custo_hora
    registro.custo = round((registro.duracao_min / 60) * float(envoxer.custo_hora), 2)
    registro.descartado = duracao_segundos < GRACE_PERIOD_SEGUNDOS

    await db.flush()
    await db.refresh(registro)
    return await _to_response(db, registro)


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
        func.coalesce(func.sum(RegistroFoco.duracao_min), 0),
        func.coalesce(func.sum(RegistroFoco.custo), 0),
        func.count(RegistroFoco.id),
    ).where(and_(
        RegistroFoco.envoxer_id == envoxer.id,
        RegistroFoco.fim.is_not(None),
        RegistroFoco.descartado.is_(False),
        RegistroFoco.inicio >= inicio_hoje,
        RegistroFoco.inicio < fim_hoje,
    ))
    hoje_min, hoje_custo, hoje_sessoes = (await db.execute(hoje_stmt)).one()

    semana_stmt = select(
        func.coalesce(func.sum(RegistroFoco.duracao_min), 0),
    ).where(and_(
        RegistroFoco.envoxer_id == envoxer.id,
        RegistroFoco.fim.is_not(None),
        RegistroFoco.descartado.is_(False),
        RegistroFoco.inicio >= inicio_semana,
        RegistroFoco.inicio < fim_semana,
    ))
    (semana_min,) = (await db.execute(semana_stmt)).one()

    return FocoResumoResponse(
        hoje_min=int(hoje_min),
        hoje_custo=float(hoje_custo),
        hoje_sessoes=int(hoje_sessoes),
        semana_min=int(semana_min),
        semana_meta_min=META_SEMANAL_MIN,
    )

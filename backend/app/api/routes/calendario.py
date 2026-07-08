"""Calendário geral — mescla tarefas com prazo + eventos (reunião/captação/live/evento_externo).

Sem VIEW no Postgres (o schema de referência tem `vw_calendario`, mas seguimos o
mesmo padrão já usado pra `vw_cliente_lista` no F0: query agregada no endpoint).
"""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, extract, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.tarefa import Tarefa
from app.models.evento import Evento, TIPO_EVENTO_VALUES
from app.schemas.calendario import EventoCreate, EventoResponse

router = APIRouter(tags=["calendario"])


@router.get("/calendario")
async def listar_calendario(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    ano: Optional[int] = None,
    mes: Optional[int] = None,
    cliente_id: Optional[int] = None,
):
    hoje = date.today()
    ano = ano or hoje.year
    mes = mes or hoje.month

    itens = []

    tarefa_stmt = (
        select(Tarefa, Cliente.nome, Cliente.status_farol)
        .join(Cliente, Cliente.id == Tarefa.cliente_id)
        .where(
            Tarefa.deleted_at.is_(None),
            Tarefa.prazo.is_not(None),
            extract("year", Tarefa.prazo) == ano,
            extract("month", Tarefa.prazo) == mes,
        )
    )
    if cliente_id is not None:
        tarefa_stmt = tarefa_stmt.where(Tarefa.cliente_id == cliente_id)

    tarefas_result = await db.execute(tarefa_stmt)
    for tarefa, cliente_nome, cliente_farol in tarefas_result.all():
        itens.append({
            "id": f"t-{tarefa.id}",
            "tipo": "tarefa",
            "titulo": tarefa.titulo,
            "data": tarefa.prazo.isoformat(),
            "hora": None,
            "cliente_id": tarefa.cliente_id,
            "cliente_nome": cliente_nome,
            "cliente_farol": cliente_farol,
        })

    evento_stmt = select(Evento, Cliente.nome, Cliente.status_farol).outerjoin(
        Cliente, Cliente.id == Evento.cliente_id
    ).where(
        Evento.deleted_at.is_(None),
        extract("year", Evento.data_inicio) == ano,
        extract("month", Evento.data_inicio) == mes,
    )
    if cliente_id is not None:
        evento_stmt = evento_stmt.where(Evento.cliente_id == cliente_id)

    eventos_result = await db.execute(evento_stmt)
    for evento, cliente_nome, cliente_farol in eventos_result.all():
        itens.append({
            "id": f"e-{evento.id}",
            "tipo": evento.tipo,
            "titulo": evento.titulo,
            "data": evento.data_inicio.date().isoformat(),
            "hora": None if evento.dia_inteiro else evento.data_inicio.strftime("%H:%M"),
            "cliente_id": evento.cliente_id,
            "cliente_nome": cliente_nome,
            "cliente_farol": cliente_farol,
            "local": evento.local,
        })

    return itens


@router.post("/eventos", response_model=EventoResponse, status_code=201)
async def criar_evento(
    payload: EventoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.tipo not in TIPO_EVENTO_VALUES:
        raise HTTPException(status_code=400, detail="tipo inválido")

    evento = Evento(
        titulo=payload.titulo,
        tipo=payload.tipo,
        cliente_id=payload.cliente_id,
        data_inicio=payload.data_inicio,
        data_fim=payload.data_fim,
        dia_inteiro=payload.dia_inteiro,
        local=payload.local,
        descricao=payload.descricao,
        criado_por_envoxer_id=envoxer.id,
    )
    db.add(evento)
    await db.flush()
    await db.refresh(evento)
    return evento


@router.delete("/eventos/{evento_id}", status_code=204)
async def excluir_evento(
    evento_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Evento).where(and_(Evento.id == evento_id, Evento.deleted_at.is_(None)))
    )
    evento = result.scalar_one_or_none()
    if evento is None:
        raise HTTPException(status_code=404, detail="Evento não encontrado")
    evento.deleted_at = datetime.now(timezone.utc)
    await db.flush()

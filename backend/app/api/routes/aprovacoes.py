"""F2 Módulo 1 — Aprovações (interna + cliente) e Alterações contabilizadas."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.tarefa import Tarefa
from app.models.escopo import Escopo
from app.models.aprovacao import Aprovacao
from app.models.alteracao import Alteracao
from app.schemas.aprovacao import (
    AprovacaoDecisaoCreate,
    AprovacaoResponse,
    AlteracaoCreate,
    AlteracaoUpdate,
    AlteracaoResponse,
)

router = APIRouter(tags=["aprovacoes"])


async def _obter_tarefa_ou_404(db: AsyncSession, tarefa_id: int) -> Tarefa:
    result = await db.execute(
        select(Tarefa).where(and_(Tarefa.id == tarefa_id, Tarefa.deleted_at.is_(None)))
    )
    tarefa = result.scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return tarefa


@router.post("/tarefas/{tarefa_id}/aprovacao", response_model=AprovacaoResponse, status_code=201)
async def decidir_aprovacao(
    tarefa_id: int,
    payload: AprovacaoDecisaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    if payload.etapa not in ("interna", "cliente"):
        raise HTTPException(status_code=400, detail="etapa deve ser 'interna' ou 'cliente'")
    if payload.decisao not in ("aprovada", "pediu_ajuste"):
        raise HTTPException(status_code=400, detail="decisao deve ser 'aprovada' ou 'pediu_ajuste'")

    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)

    if payload.etapa == "interna":
        if envoxer.permissao not in ("admin", "gestor"):
            raise HTTPException(status_code=403, detail="Só gestor ou admin decide a aprovação interna")
        if tarefa.status != "revisao_interna":
            raise HTTPException(status_code=400, detail="Tarefa não está em Revisão interna")
        if payload.decisao == "aprovada":
            tarefa.aprovada_interna = True
            tarefa.status = "aprovacao_cliente"
        else:
            if not payload.comentario:
                raise HTTPException(status_code=400, detail="Comentário é obrigatório ao pedir ajuste")
            tarefa.status = "ajustes"
    else:  # cliente
        if tarefa.status != "aprovacao_cliente":
            raise HTTPException(status_code=400, detail="Tarefa não está em Aprovação cliente")
        if payload.decisao == "pediu_ajuste":
            raise HTTPException(
                status_code=400,
                detail="Para solicitar alteração do cliente use POST /tarefas/{id}/alteracoes",
            )
        tarefa.aprovada_cliente = True
        tarefa.status = "programado"

    aprovacao = Aprovacao(
        tarefa_id=tarefa.id,
        etapa=payload.etapa,
        decisao=payload.decisao,
        decidido_por_envoxer_id=envoxer.id,
        decidido_por_cliente_nome=payload.decidido_por_cliente_nome if payload.etapa == "cliente" else None,
        comentario=payload.comentario,
    )
    db.add(aprovacao)
    await db.flush()
    await db.refresh(aprovacao)
    return aprovacao


@router.get("/tarefas/{tarefa_id}/aprovacoes", response_model=list[AprovacaoResponse])
async def listar_aprovacoes(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    result = await db.execute(
        select(Aprovacao).where(Aprovacao.tarefa_id == tarefa_id).order_by(Aprovacao.created_at)
    )
    return list(result.scalars().all())


@router.post("/tarefas/{tarefa_id}/alteracoes", status_code=201)
async def solicitar_alteracao(
    tarefa_id: int,
    payload: AlteracaoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    tarefa = await _obter_tarefa_ou_404(db, tarefa_id)
    if tarefa.status != "aprovacao_cliente":
        raise HTTPException(status_code=400, detail="Tarefa não está em Aprovação cliente")

    numero_result = await db.execute(
        select(func.coalesce(func.max(Alteracao.numero), 0)).where(Alteracao.tarefa_id == tarefa_id)
    )
    proximo_numero = numero_result.scalar_one() + 1

    alteracao = Alteracao(
        tarefa_id=tarefa_id,
        numero=proximo_numero,
        descricao=payload.descricao,
        solicitante_cliente_nome=payload.solicitante_cliente_nome,
    )
    db.add(alteracao)

    tarefa.qtd_alteracoes = proximo_numero
    tarefa.status = "ajustes"
    await db.flush()
    await db.refresh(alteracao)

    escopo_result = await db.execute(select(Escopo).where(Escopo.cliente_id == tarefa.cliente_id))
    escopo = escopo_result.scalar_one_or_none()
    limite = escopo.limite_alteracoes if escopo else None
    ultrapassou = limite is not None and proximo_numero > limite

    return {
        "alteracao": AlteracaoResponse.model_validate(alteracao),
        "limite_alteracoes": limite,
        "ultrapassou_limite": ultrapassou,
    }


@router.get("/tarefas/{tarefa_id}/alteracoes", response_model=list[AlteracaoResponse])
async def listar_alteracoes(
    tarefa_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _obter_tarefa_ou_404(db, tarefa_id)
    result = await db.execute(
        select(Alteracao).where(Alteracao.tarefa_id == tarefa_id).order_by(Alteracao.numero)
    )
    return list(result.scalars().all())


@router.patch("/alteracoes/{alteracao_id}", response_model=AlteracaoResponse)
async def atualizar_alteracao(
    alteracao_id: int,
    payload: AlteracaoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(Alteracao).where(Alteracao.id == alteracao_id))
    alteracao = result.scalar_one_or_none()
    if alteracao is None:
        raise HTTPException(status_code=404, detail="Alteração não encontrada")

    updates = payload.model_dump(exclude_unset=True)
    if updates.get("status") and updates["status"] not in ("pendente", "em_execucao", "feita", "descartada"):
        raise HTTPException(status_code=400, detail="status inválido")
    for field, value in updates.items():
        setattr(alteracao, field, value)
    await db.flush()
    await db.refresh(alteracao)
    return alteracao

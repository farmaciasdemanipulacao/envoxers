"""Portal do Cliente — Módulo B: Itens de Escopo (controle de entregáveis)."""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.item_escopo import ItemEscopo
from app.models.item_escopo_historico import ItemEscopoHistorico
from app.models.entrega_manual import EntregaManual
from app.models.alerta_entrega import AlertaEntrega, STATUS_ALERTA_ENTREGA_VALUES
from app.schemas.item_escopo import (
    ItemEscopoCreate, ItemEscopoUpdate, ItemEscopoResponse, ItemEscopoHistoricoResponse,
    EntregaManualCreate, EntregaManualResponse, ReconciliacaoMesResponse, PainelEntregaveisItem,
    AlertaEntregaResponse, AlertaEntregaUpdate,
)
from app.services.entregaveis import calcular_reconciliacao_range, gerar_alertas_gap, aplicar_mudanca_quantidade

router = APIRouter(tags=["item-escopo"])


async def _get_cliente_ou_404(db, cliente_id: int) -> Cliente:
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


async def _get_item_ou_404(db, cliente_id: int, item_id: int) -> ItemEscopo:
    result = await db.execute(select(ItemEscopo).where(ItemEscopo.id == item_id, ItemEscopo.cliente_id == cliente_id))
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="Item de escopo não encontrado")
    return item


@router.get("/clientes/{cliente_id}/itens-escopo", response_model=list[ItemEscopoResponse])
async def listar_itens_escopo(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _get_cliente_ou_404(db, cliente_id)
    result = await db.execute(select(ItemEscopo).where(ItemEscopo.cliente_id == cliente_id).order_by(ItemEscopo.tipo))
    return list(result.scalars().all())


@router.post("/clientes/{cliente_id}/itens-escopo", response_model=ItemEscopoResponse, status_code=201)
async def criar_item_escopo(
    cliente_id: int,
    payload: ItemEscopoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    await _get_cliente_ou_404(db, cliente_id)
    if payload.cadencia not in ("mensal", "pontual"):
        raise HTTPException(status_code=400, detail="cadência inválida")
    item = ItemEscopo(
        cliente_id=cliente_id, tipo=payload.tipo, descricao=payload.descricao,
        cadencia=payload.cadencia, quantidade=payload.quantidade,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return item


@router.patch("/clientes/{cliente_id}/itens-escopo/{item_id}", response_model=ItemEscopoResponse)
async def atualizar_item_escopo(
    cliente_id: int,
    item_id: int,
    payload: ItemEscopoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    item = await _get_item_ou_404(db, cliente_id, item_id)

    if payload.quantidade is not None and payload.quantidade != item.quantidade:
        if not payload.motivo:
            raise HTTPException(status_code=400, detail="motivo é obrigatório ao mudar a quantidade")
        await aplicar_mudanca_quantidade(db, item, payload.quantidade, payload.motivo, alterado_por_envoxer_id=envoxer.id)

    if payload.tipo is not None:
        item.tipo = payload.tipo
    if payload.descricao is not None:
        item.descricao = payload.descricao
    if payload.cadencia is not None:
        if payload.cadencia not in ("mensal", "pontual"):
            raise HTTPException(status_code=400, detail="cadência inválida")
        item.cadencia = payload.cadencia
    if payload.ativo is not None:
        item.ativo = payload.ativo

    await db.flush()
    await db.refresh(item)
    return item


@router.get("/clientes/{cliente_id}/itens-escopo/{item_id}/historico", response_model=list[ItemEscopoHistoricoResponse])
async def historico_item_escopo(
    cliente_id: int,
    item_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _get_item_ou_404(db, cliente_id, item_id)
    result = await db.execute(
        select(ItemEscopoHistorico, Envoxer.nome)
        .outerjoin(Envoxer, Envoxer.id == ItemEscopoHistorico.alterado_por_envoxer_id)
        .where(ItemEscopoHistorico.item_escopo_id == item_id)
        .order_by(ItemEscopoHistorico.created_at.desc())
    )
    return [
        ItemEscopoHistoricoResponse(
            id=h.id, quantidade_anterior=h.quantidade_anterior, quantidade_nova=h.quantidade_nova,
            motivo=h.motivo, alterado_por_envoxer_nome=nome, created_at=h.created_at,
        )
        for h, nome in result.all()
    ]


@router.post("/clientes/{cliente_id}/itens-escopo/{item_id}/lancar-entrega", response_model=EntregaManualResponse, status_code=201)
async def lancar_entrega_manual(
    cliente_id: int,
    item_id: int,
    payload: EntregaManualCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _get_item_ou_404(db, cliente_id, item_id)
    if payload.quantidade <= 0:
        raise HTTPException(status_code=400, detail="quantidade deve ser maior que zero")
    entrega = EntregaManual(
        item_escopo_id=item_id, ano_mes=payload.ano_mes, quantidade=payload.quantidade,
        observacao=payload.observacao, lancado_por_envoxer_id=envoxer.id,
    )
    db.add(entrega)
    await db.flush()
    await db.refresh(entrega)
    return EntregaManualResponse(
        id=entrega.id, ano_mes=entrega.ano_mes, quantidade=entrega.quantidade,
        observacao=entrega.observacao, lancado_por_nome=envoxer.nome, created_at=entrega.created_at,
    )


@router.get("/clientes/{cliente_id}/reconciliacao", response_model=list[ReconciliacaoMesResponse])
async def reconciliacao_cliente(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    meses: int = 6,
):
    await _get_cliente_ou_404(db, cliente_id)
    meses = max(1, min(meses, 24))
    resultado = await calcular_reconciliacao_range(db, cliente_id, meses)
    await gerar_alertas_gap(db, cliente_id, resultado)
    await db.commit()
    return resultado


@router.get("/entregaveis/painel", response_model=list[PainelEntregaveisItem])
async def painel_entregaveis(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Visão cruzada de todos os clientes ativos no mês corrente — pra o time
    ver de longe quem tem gap, sem precisar abrir cliente por cliente."""
    clientes_result = await db.execute(select(Cliente).where(Cliente.deleted_at.is_(None), Cliente.ativo.is_(True)))
    clientes = clientes_result.scalars().all()

    ordem_status = {"nao_entregue": 0, "parcial": 1, "em_andamento": 2, "completo": 3, "excedente": 3}
    respostas = []
    for cliente in clientes:
        meses_resp = await calcular_reconciliacao_range(db, cliente.id, meses=1)
        if not meses_resp or not meses_resp[0].itens:
            continue
        mes = meses_resp[0]
        pior = min(mes.itens, key=lambda i: ordem_status.get(i.status, 9))
        gaps = sum(1 for i in mes.itens if i.status in ("parcial", "nao_entregue"))
        respostas.append(PainelEntregaveisItem(
            cliente_id=cliente.id, cliente_nome=cliente.nome, ano_mes=mes.ano_mes,
            total_itens=len(mes.itens), itens_com_gap=gaps, pior_status=pior.status,
        ))

    respostas.sort(key=lambda r: (ordem_status.get(r.pior_status, 9), -r.itens_com_gap))
    return respostas


@router.get("/alertas-entrega", response_model=list[AlertaEntregaResponse])
async def listar_alertas_entrega(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
    status: Optional[str] = None,
    cliente_id: Optional[int] = None,
):
    if status is not None and status not in STATUS_ALERTA_ENTREGA_VALUES:
        raise HTTPException(status_code=400, detail="status inválido")

    reconhecedor = Envoxer.__table__.alias("reconhecedor")
    stmt = (
        select(AlertaEntrega, Cliente.nome, ItemEscopo.tipo, ItemEscopo.descricao, reconhecedor.c.nome)
        .join(Cliente, Cliente.id == AlertaEntrega.cliente_id)
        .join(ItemEscopo, ItemEscopo.id == AlertaEntrega.item_escopo_id)
        .outerjoin(reconhecedor, reconhecedor.c.id == AlertaEntrega.reconhecido_por_envoxer_id)
    )
    if status is not None:
        stmt = stmt.where(AlertaEntrega.status == status)
    if cliente_id is not None:
        stmt = stmt.where(AlertaEntrega.cliente_id == cliente_id)
    stmt = stmt.order_by(AlertaEntrega.created_at.desc())

    result = await db.execute(stmt)
    respostas = []
    for alerta, cliente_nome, item_tipo, item_descricao, reconhecedor_nome in result.all():
        resp = AlertaEntregaResponse.model_validate(alerta)
        resp.cliente_nome = cliente_nome
        resp.item_tipo = item_tipo
        resp.item_descricao = item_descricao
        resp.reconhecido_por_nome = reconhecedor_nome
        respostas.append(resp)
    return respostas


@router.patch("/alertas-entrega/{alerta_id}", response_model=AlertaEntregaResponse)
async def atualizar_alerta_entrega(
    alerta_id: int,
    payload: AlertaEntregaUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(AlertaEntrega).where(AlertaEntrega.id == alerta_id))
    alerta = result.scalar_one_or_none()
    if alerta is None:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")

    updates = payload.model_dump(exclude_unset=True)
    if "resolucao_nota" in updates:
        alerta.resolucao_nota = updates["resolucao_nota"]

    if "status" in updates:
        novo_status = updates["status"]
        if novo_status not in STATUS_ALERTA_ENTREGA_VALUES:
            raise HTTPException(status_code=400, detail="status inválido")
        if novo_status == "resolvido" and not alerta.resolucao_nota:
            raise HTTPException(status_code=400, detail="resolucao_nota é obrigatória ao resolver o alerta")

        agora = datetime.now(timezone.utc)
        if novo_status == "reconhecido" and alerta.reconhecido_em is None:
            alerta.reconhecido_em = agora
            alerta.reconhecido_por_envoxer_id = envoxer.id
        if novo_status == "resolvido":
            alerta.resolvido_em = agora
        alerta.status = novo_status

    await db.flush()
    cliente = (await db.execute(select(Cliente).where(Cliente.id == alerta.cliente_id))).scalar_one_or_none()
    item = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == alerta.item_escopo_id))).scalar_one_or_none()
    reconhecedor_nome = None
    if alerta.reconhecido_por_envoxer_id:
        r = (await db.execute(select(Envoxer).where(Envoxer.id == alerta.reconhecido_por_envoxer_id))).scalar_one_or_none()
        reconhecedor_nome = r.nome if r else None

    resp = AlertaEntregaResponse.model_validate(alerta)
    resp.cliente_nome = cliente.nome if cliente else None
    resp.item_tipo = item.tipo if item else None
    resp.item_descricao = item.descricao if item else None
    resp.reconhecido_por_nome = reconhecedor_nome
    return resp

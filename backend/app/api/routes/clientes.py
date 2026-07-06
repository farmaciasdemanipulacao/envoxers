from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.cliente_servico import ClienteServico
from app.models.escopo import Escopo
from app.models.churn_snapshot import ChurnSnapshot
from app.models.motivo_churn import MotivoChurnCatalogo
from app.schemas.cliente import ClienteCreate, ClienteUpdate, ClienteResponse, ClienteListItem
from app.schemas.churn import ChurnSnapshotResponse
from app.services.perfil import recalcular_e_persistir_perfil

router = APIRouter(prefix="/clientes", tags=["clientes"])


def _meses_de_casa(inicio: Optional[date]) -> Optional[int]:
    if inicio is None:
        return None
    hoje = date.today()
    return (hoje.year - inicio.year) * 12 + (hoje.month - inicio.month)


@router.get("", response_model=list[ClienteListItem])
async def listar_clientes(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    """Equivalente a vw_cliente_lista do schema.sql, calculado aqui em vez de VIEW no banco."""
    soma_servicos = (
        select(
            ClienteServico.cliente_id,
            func.coalesce(func.sum(ClienteServico.valor_mensal), 0).label("soma"),
        )
        .group_by(ClienteServico.cliente_id)
        .subquery()
    )

    stmt = (
        select(Cliente, soma_servicos.c.soma, Envoxer.nome, Envoxer.foto_url)
        .outerjoin(soma_servicos, soma_servicos.c.cliente_id == Cliente.id)
        .outerjoin(Envoxer, Envoxer.id == Cliente.responsavel_envoxer_id)
        .where(Cliente.deleted_at.is_(None))
        .order_by(Cliente.nome)
    )
    result = await db.execute(stmt)

    itens = []
    for cliente, soma, resp_nome, resp_foto in result.all():
        itens.append(
            ClienteListItem(
                id=cliente.id,
                nome=cliente.nome,
                logo_url=cliente.logo_url,
                status_farol=cliente.status_farol,
                tipo_receita=cliente.tipo_receita,
                segmento=cliente.segmento,
                data_inicio_contrato=cliente.data_inicio_contrato,
                valor_contrato=float(cliente.valor_contrato),
                valor_servicos_soma=float(soma or 0),
                meses_de_casa=_meses_de_casa(cliente.data_inicio_contrato),
                responsavel_nome=resp_nome,
                responsavel_foto=resp_foto,
                ativo=cliente.ativo,
            )
        )
    return itens


@router.get("/{cliente_id}", response_model=ClienteResponse)
async def obter_cliente(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Cliente).where(and_(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    )
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    resp = ClienteResponse.model_validate(cliente)
    if cliente.data_cancelamento is not None:
        resp.churn = await _obter_churn_snapshot(db, cliente_id)
    elif cliente.ativo:
        resp.perfil = await recalcular_e_persistir_perfil(db, cliente_id)
    return resp


async def _obter_churn_snapshot(db: AsyncSession, cliente_id: int) -> Optional[ChurnSnapshotResponse]:
    result = await db.execute(
        select(ChurnSnapshot, MotivoChurnCatalogo.nome)
        .join(MotivoChurnCatalogo, MotivoChurnCatalogo.codigo == ChurnSnapshot.motivo_codigo)
        .where(ChurnSnapshot.cliente_id == cliente_id)
    )
    row = result.first()
    if row is None:
        return None
    snapshot, motivo_nome = row
    resp = ChurnSnapshotResponse.model_validate(snapshot)
    resp.motivo_nome = motivo_nome
    return resp


@router.post("", response_model=ClienteResponse, status_code=201)
async def criar_cliente(
    payload: ClienteCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    data = payload.model_dump(exclude={"servicos", "escopo"})
    cliente = Cliente(**data)
    db.add(cliente)
    await db.flush()

    for item in payload.servicos:
        db.add(ClienteServico(cliente_id=cliente.id, **item.model_dump()))

    if payload.escopo:
        db.add(Escopo(cliente_id=cliente.id, **payload.escopo.model_dump()))

    await db.flush()
    await db.refresh(cliente)
    return cliente


@router.patch("/{cliente_id}", response_model=ClienteResponse)
async def atualizar_cliente(
    cliente_id: int,
    payload: ClienteUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")

    updates = payload.model_dump(exclude_unset=True, exclude={"servicos", "escopo"})
    for field, value in updates.items():
        setattr(cliente, field, value)

    if payload.servicos is not None:
        await db.execute(
            ClienteServico.__table__.delete().where(ClienteServico.cliente_id == cliente_id)
        )
        for item in payload.servicos:
            db.add(ClienteServico(cliente_id=cliente_id, **item.model_dump()))

    if payload.escopo is not None:
        existente = await db.execute(select(Escopo).where(Escopo.cliente_id == cliente_id))
        escopo = existente.scalar_one_or_none()
        if escopo:
            for field, value in payload.escopo.model_dump().items():
                setattr(escopo, field, value)
        else:
            db.add(Escopo(cliente_id=cliente_id, **payload.escopo.model_dump()))

    await db.flush()
    await db.refresh(cliente)
    return cliente


@router.delete("/{cliente_id}", status_code=204)
async def arquivar_cliente(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    """Soft delete."""
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    cliente.deleted_at = datetime.now(timezone.utc)
    await db.flush()

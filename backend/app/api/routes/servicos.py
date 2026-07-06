from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.servico import Servico
from app.schemas.servico import ServicoCreate, ServicoUpdate, ServicoResponse

router = APIRouter(prefix="/servicos", tags=["servicos"])


@router.get("", response_model=list[ServicoResponse])
async def listar_servicos(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(select(Servico).order_by(Servico.nome))
    return result.scalars().all()


@router.post("", response_model=ServicoResponse, status_code=201)
async def criar_servico(
    payload: ServicoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    servico = Servico(**payload.model_dump())
    db.add(servico)
    await db.flush()
    await db.refresh(servico)
    return servico


@router.patch("/{servico_id}", response_model=ServicoResponse)
async def atualizar_servico(
    servico_id: int,
    payload: ServicoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    result = await db.execute(select(Servico).where(Servico.id == servico_id))
    servico = result.scalar_one_or_none()
    if servico is None:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(servico, field, value)
    await db.flush()
    await db.refresh(servico)
    return servico

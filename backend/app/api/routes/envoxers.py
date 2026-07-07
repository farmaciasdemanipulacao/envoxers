from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin, get_current_envoxer
from app.core.security import hash_password
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.schemas.envoxer import EnvoxerCreate, EnvoxerUpdate, EnvoxerResponse

router = APIRouter(prefix="/envoxers", tags=["envoxers"])

_EMAIL_LIBERADO_PREFIXO = "deletado_"


def _liberar_email(envoxer: Envoxer) -> None:
    """Ao desativar, renomeia o e-mail (preservando histórico) pra liberar o original
    pra reuso em um novo cadastro. Idempotente — não re-renomeia quem já foi liberado."""
    if not envoxer.email.startswith(_EMAIL_LIBERADO_PREFIXO):
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        envoxer.email = f"{_EMAIL_LIBERADO_PREFIXO}{timestamp}_{envoxer.email}"


@router.get("", response_model=list[EnvoxerResponse])
async def listar_envoxers(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    result = await db.execute(
        select(Envoxer).where(Envoxer.deleted_at.is_(None)).order_by(Envoxer.nome)
    )
    return result.scalars().all()


@router.post("", response_model=EnvoxerResponse, status_code=201)
async def criar_envoxer(
    payload: EnvoxerCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    existente = await db.execute(select(Envoxer).where(Envoxer.email == payload.email))
    if existente.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Já existe um envoxer com esse e-mail")

    data = payload.model_dump(exclude={"senha"})
    custo_hora = round(payload.salario_mensal / payload.horas_mes, 2)
    envoxer = Envoxer(**data, senha_hash=hash_password(payload.senha), custo_hora=custo_hora)
    db.add(envoxer)
    await db.flush()
    await db.refresh(envoxer)
    return envoxer


@router.patch("/{envoxer_id}", response_model=EnvoxerResponse)
async def atualizar_envoxer(
    envoxer_id: int,
    payload: EnvoxerUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    envoxer = result.scalar_one_or_none()
    if envoxer is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")

    estava_ativo = envoxer.ativo

    updates = payload.model_dump(exclude_unset=True, exclude={"senha"})
    for field, value in updates.items():
        setattr(envoxer, field, value)
    if payload.senha:
        envoxer.senha_hash = hash_password(payload.senha)

    # Fluxo real de "exclusão" no frontend é este PATCH (radio Ativo: Sim/Não), não o DELETE abaixo.
    if estava_ativo and envoxer.ativo is False:
        _liberar_email(envoxer)

    if "salario_mensal" in updates or "horas_mes" in updates:
        if envoxer.salario_mensal is not None:
            envoxer.custo_hora = round(envoxer.salario_mensal / envoxer.horas_mes, 2)
        else:
            envoxer.custo_hora = 0

    await db.flush()
    await db.refresh(envoxer)
    return envoxer


@router.delete("/{envoxer_id}", status_code=204)
async def desativar_envoxer(
    envoxer_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    """Soft delete — envoxer não some, só some das seleções (ativo=False); e-mail liberado para reuso."""
    result = await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))
    envoxer = result.scalar_one_or_none()
    if envoxer is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")
    if envoxer.ativo:
        _liberar_email(envoxer)
    envoxer.ativo = False
    await db.flush()

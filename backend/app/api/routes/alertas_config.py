"""Configuração de alertas — catálogo de tipos (Farol geral + sinais individuais +
chat DM) que o admin master liga/desliga e define quem recebe. Só admin acessa.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.alerta_config import AlertaConfig
from app.schemas.alerta_config import AlertaConfigResponse, AlertaConfigUpdate

router = APIRouter(prefix="/admin/alertas-config", tags=["alertas-config"])

_PAPEIS_VALIDOS = {"admin", "gestor", "envoxer"}


@router.get("", response_model=list[AlertaConfigResponse])
async def listar_alertas_config(
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    result = await db.execute(select(AlertaConfig).order_by(AlertaConfig.grupo, AlertaConfig.id))
    return result.scalars().all()


@router.patch("/{config_id}", response_model=AlertaConfigResponse)
async def atualizar_alerta_config(
    config_id: int,
    payload: AlertaConfigUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_admin)],
):
    config = await db.get(AlertaConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Tipo de alerta não encontrado")

    if payload.papeis is not None:
        invalidos = set(payload.papeis) - _PAPEIS_VALIDOS
        if invalidos:
            raise HTTPException(status_code=400, detail=f"Papel(éis) inválido(s): {', '.join(invalidos)}")

    if payload.ativo is not None:
        config.ativo = payload.ativo
    if payload.papeis is not None:
        config.papeis = payload.papeis

    await db.commit()
    await db.refresh(config)
    return config

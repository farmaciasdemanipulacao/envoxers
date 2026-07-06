"""Dependências compartilhadas das rotas — auth via JWT."""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.envoxer import Envoxer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_envoxer(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Envoxer:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    envoxer_id = payload.get("sub")
    if envoxer_id is None:
        raise credentials_exception

    result = await db.execute(select(Envoxer).where(Envoxer.id == int(envoxer_id)))
    envoxer = result.scalar_one_or_none()
    if envoxer is None or not envoxer.ativo:
        raise credentials_exception
    return envoxer


async def get_current_admin(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
) -> Envoxer:
    if envoxer.permissao != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas admin")
    return envoxer


async def get_current_gestor_ou_admin(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
) -> Envoxer:
    if envoxer.permissao not in ("admin", "gestor"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas gestor ou admin")
    return envoxer

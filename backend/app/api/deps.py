"""Dependências compartilhadas das rotas — auth via JWT."""
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente_contato import ClienteContato

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_portal = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/auth/login", auto_error=False)


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
    # Token do Portal do Cliente tem "tipo": "cliente_contato" — nunca deve valer
    # nas rotas internas do Envoxers, mesmo que o "sub" coincida com um id de Envoxer.
    if payload.get("tipo") not in (None, "envoxer"):
        raise credentials_exception
    envoxer_id = payload.get("sub")
    if envoxer_id is None:
        raise credentials_exception

    result = await db.execute(select(Envoxer).where(Envoxer.id == int(envoxer_id)))
    envoxer = result.scalar_one_or_none()
    if envoxer is None or not envoxer.ativo:
        raise credentials_exception
    return envoxer


async def get_current_cliente_contato(
    token: Annotated[Optional[str], Depends(oauth2_scheme_portal)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ClienteContato:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciais inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise credentials_exception
    payload = decode_access_token(token)
    if payload is None or payload.get("tipo") != "cliente_contato":
        raise credentials_exception
    contato_id = payload.get("sub")
    if contato_id is None:
        raise credentials_exception

    result = await db.execute(select(ClienteContato).where(ClienteContato.id == int(contato_id)))
    contato = result.scalar_one_or_none()
    if contato is None or not contato.ativo:
        raise credentials_exception
    return contato


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

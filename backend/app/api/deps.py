"""Dependências compartilhadas das rotas — auth via JWT."""
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente_contato import ClienteContato

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
oauth2_scheme_portal = OAuth2PasswordBearer(tokenUrl="/api/v1/portal/auth/login", auto_error=False)


def perfil_comercial_pode_acessar(path: str, method: str) -> bool:
    """Allowlist do perfil Comercial. Mantida aqui para ser auditável/testável.

    GET /envoxers existe apenas para o diretório de pessoas usado pelo Chat.
    """
    path = path.rstrip("/")
    return (
        path.startswith("/api/v1/comercial")
        or path.startswith("/api/v1/chat")
        or path.startswith("/api/v1/push")
        or path == "/api/v1/auth/me"
        or path == "/api/v1/envoxers/me/status-instalacao"
        or (path == "/api/v1/envoxers" and method.upper() == "GET")
    )


async def get_current_envoxer(
    request: Request,
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

    # Perfil COMERCIAL: fronteira de autorização no backend, não apenas no menu.
    # Pode usar o CRM, Chat e dependências técnicas indispensáveis ao Chat/PWA.
    # GET /envoxers é permitido somente como diretório de pessoas para iniciar DMs.
    if envoxer.permissao == "comercial":
        if not perfil_comercial_pode_acessar(request.url.path, request.method):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Perfil Comercial possui acesso somente ao Chat e ao módulo Comercial",
            )
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

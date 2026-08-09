from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.acesso_log import AcessoLog
from app.schemas.auth import LoginRequest, Token, EnvoxerMe

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
async def login(payload: LoginRequest, request: Request, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(Envoxer).where(Envoxer.email == payload.email))
    envoxer = result.scalar_one_or_none()

    if envoxer is None or not verify_password(payload.senha, envoxer.senha_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos")
    if not envoxer.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Envoxer inativo")

    access_token = create_access_token({"sub": str(envoxer.id), "tipo": "envoxer"})

    # Histórico de acessos (D-114) — independente do timer de Foco, acesso = logar no app.
    db.add(AcessoLog(
        envoxer_id=envoxer.id,
        ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    ))
    await db.flush()

    return Token(
        access_token=access_token,
        id=envoxer.id,
        nome=envoxer.nome,
        permissao=envoxer.permissao,
        foto_url=envoxer.foto_url,
    )


@router.get("/me", response_model=EnvoxerMe)
async def me(envoxer: Annotated[Envoxer, Depends(get_current_envoxer)]):
    return envoxer

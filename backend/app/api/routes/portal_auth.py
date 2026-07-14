"""Portal do Cliente — Módulo A: auth pública do contato do cliente.

Rotas sem `get_current_envoxer` — acessadas de fora, sem login interno.
"""
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_cliente_contato
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.schemas.cliente_contato import PortalSetSenhaRequest, PortalLoginRequest, PortalToken, PortalContatoMe

router = APIRouter(prefix="/portal/auth", tags=["portal-auth"])


@router.post("/definir-senha")
async def definir_senha(payload: PortalSetSenhaRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(ClienteContato).where(ClienteContato.set_senha_token == payload.token))
    contato = result.scalar_one_or_none()
    if contato is None or not contato.ativo:
        raise HTTPException(status_code=400, detail="Link inválido")
    if contato.set_senha_token_expira is None or contato.set_senha_token_expira < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Link expirado — peça um novo link ao seu contato na Envox")
    if len(payload.senha) < 8:
        raise HTTPException(status_code=400, detail="A senha precisa ter pelo menos 8 caracteres")

    contato.senha_hash = hash_password(payload.senha)
    contato.set_senha_token = None
    contato.set_senha_token_expira = None
    await db.commit()
    return {"ok": True}


@router.post("/login", response_model=PortalToken)
async def login(payload: PortalLoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(ClienteContato).where(ClienteContato.email == payload.email))
    contato = result.scalar_one_or_none()

    if contato is None or contato.senha_hash is None or not verify_password(payload.senha, contato.senha_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="E-mail ou senha inválidos")
    if not contato.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso desativado — fale com seu contato na Envox")

    cliente = (await db.execute(select(Cliente).where(Cliente.id == contato.cliente_id))).scalar_one_or_none()
    if cliente is None or cliente.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso desativado")

    access_token = create_access_token({"sub": str(contato.id), "tipo": "cliente_contato"})
    return PortalToken(access_token=access_token, id=contato.id, nome=contato.nome, cliente_id=cliente.id, cliente_nome=cliente.nome)


@router.get("/me", response_model=PortalContatoMe)
async def me(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    cliente = (await db.execute(select(Cliente).where(Cliente.id == contato.cliente_id))).scalar_one_or_none()
    return PortalContatoMe(
        id=contato.id, nome=contato.nome, email=contato.email, cargo=contato.cargo,
        cliente_id=contato.cliente_id, cliente_nome=cliente.nome if cliente else "",
    )

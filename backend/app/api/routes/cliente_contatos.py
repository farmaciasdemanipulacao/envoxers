"""Portal do Cliente — Módulo A: gestão interna dos contatos do cliente (só gestor/admin).

Sem infra de e-mail no projeto — ao criar um contato ou reenviar o link, a
resposta inclui `link_definicao_senha` pronto pra copiar e mandar por
WhatsApp/e-mail manualmente (mesmo padrão sem-integração-externa do resto do
Envoxers).
"""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.cliente_contato import ClienteContato
from app.schemas.cliente_contato import ClienteContatoCreate, ClienteContatoUpdate, ClienteContatoResponse, ClienteContatoComLink

router = APIRouter(tags=["cliente-contatos"])

TOKEN_VALIDADE_DIAS = 7


def _gerar_link_token(contato: ClienteContato) -> str:
    contato.set_senha_token = secrets.token_urlsafe(32)
    contato.set_senha_token_expira = datetime.now(timezone.utc) + timedelta(days=TOKEN_VALIDADE_DIAS)
    return f"/portal/definir-senha?token={contato.set_senha_token}"


def _serializar(contato: ClienteContato) -> ClienteContatoResponse:
    return ClienteContatoResponse(
        id=contato.id, cliente_id=contato.cliente_id, nome=contato.nome, cargo=contato.cargo,
        email=contato.email, ativo=contato.ativo, senha_definida=contato.senha_hash is not None,
        created_at=contato.created_at,
    )


async def _get_cliente_ou_404(db: AsyncSession, cliente_id: int) -> Cliente:
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


async def _get_contato_ou_404(db: AsyncSession, cliente_id: int, contato_id: int) -> ClienteContato:
    result = await db.execute(
        select(ClienteContato).where(ClienteContato.id == contato_id, ClienteContato.cliente_id == cliente_id)
    )
    contato = result.scalar_one_or_none()
    if contato is None:
        raise HTTPException(status_code=404, detail="Contato não encontrado")
    return contato


@router.get("/clientes/{cliente_id}/contatos", response_model=list[ClienteContatoResponse])
async def listar_contatos(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    await _get_cliente_ou_404(db, cliente_id)
    result = await db.execute(
        select(ClienteContato).where(ClienteContato.cliente_id == cliente_id).order_by(ClienteContato.nome)
    )
    return [_serializar(c) for c in result.scalars().all()]


@router.post("/clientes/{cliente_id}/contatos", response_model=ClienteContatoComLink)
async def criar_contato(
    cliente_id: int,
    payload: ClienteContatoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    await _get_cliente_ou_404(db, cliente_id)

    existente = await db.execute(select(ClienteContato).where(ClienteContato.email == payload.email))
    if existente.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Já existe um contato com esse e-mail")

    contato = ClienteContato(
        cliente_id=cliente_id, nome=payload.nome, cargo=payload.cargo, email=payload.email,
        criado_por_envoxer_id=envoxer.id,
    )
    link = _gerar_link_token(contato)
    db.add(contato)
    await db.commit()
    await db.refresh(contato)

    return ClienteContatoComLink(**_serializar(contato).model_dump(), link_definicao_senha=link)


@router.patch("/clientes/{cliente_id}/contatos/{contato_id}", response_model=ClienteContatoResponse)
async def atualizar_contato(
    cliente_id: int,
    contato_id: int,
    payload: ClienteContatoUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    contato = await _get_contato_ou_404(db, cliente_id, contato_id)

    dados = payload.model_dump(exclude_unset=True)
    if "email" in dados and dados["email"] != contato.email:
        existente = await db.execute(select(ClienteContato).where(ClienteContato.email == dados["email"]))
        if existente.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail="Já existe um contato com esse e-mail")
    for campo, valor in dados.items():
        setattr(contato, campo, valor)

    await db.commit()
    await db.refresh(contato)
    return _serializar(contato)


@router.post("/clientes/{cliente_id}/contatos/{contato_id}/reenviar-link", response_model=ClienteContatoComLink)
async def reenviar_link(
    cliente_id: int,
    contato_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    contato = await _get_contato_ou_404(db, cliente_id, contato_id)
    link = _gerar_link_token(contato)
    await db.commit()
    await db.refresh(contato)
    return ClienteContatoComLink(**_serializar(contato).model_dump(), link_definicao_senha=link)

"""Portal do Cliente — Módulo C: documentos de acordo do lado do cliente."""
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_cliente_contato
from app.db.session import get_db
from app.models.cliente_contato import ClienteContato
from app.models.documento_acordo import DocumentoAcordo
from app.schemas.documento_acordo import DocumentoAcordoResponse
from app.services.documentos_acordo import confirmar_como_cliente_contato
from app.api.routes.documento_acordo import serializar_documento

router = APIRouter(prefix="/portal", tags=["portal-documentos"])


@router.get("/documentos", response_model=list[DocumentoAcordoResponse])
async def listar_documentos_portal(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(
        select(DocumentoAcordo).where(DocumentoAcordo.cliente_id == contato.cliente_id).order_by(DocumentoAcordo.created_at.desc())
    )
    return [await serializar_documento(db, d) for d in result.scalars().all()]


@router.post("/documentos/{documento_id}/confirmar", response_model=DocumentoAcordoResponse)
async def confirmar_documento_portal(
    documento_id: int,
    request: Request,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    documento = await confirmar_como_cliente_contato(db, documento_id, contato.id, ip, user_agent)
    await db.commit()
    return await serializar_documento(db, documento)

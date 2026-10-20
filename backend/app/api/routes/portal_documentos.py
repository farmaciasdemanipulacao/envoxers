"""Portal do Cliente — Módulo C: documentos de acordo do lado do cliente."""
from typing import Annotated

from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_cliente_contato
from app.db.session import get_db
from app.models.cliente_contato import ClienteContato
from app.models.documento_acordo import DocumentoAcordo
from app.models.documento_confirmacao import DocumentoConfirmacao
from app.services.portal_permissoes import pode
from app.schemas.documento_acordo import DocumentoAcordoResponse
from app.services.documentos_acordo import confirmar_como_cliente_contato
from app.api.routes.documento_acordo import serializar_documento

router = APIRouter(prefix="/portal", tags=["portal-documentos"])

def projetar_documento_cliente(dado: DocumentoAcordoResponse, contato_id: int) -> dict:
    """Nunca devolver a um cliente IP, e-mail, ID interno ou identidade de terceiros."""
    return {
        "id": dado.id,
        "motivo": dado.motivo,
        "status": dado.status,
        "itens_alterados": [item.model_dump() for item in dado.itens_alterados],
        "confirmacoes": [
            {"cliente_contato_id": c.cliente_contato_id, "confirmado_em": c.confirmado_em}
            for c in dado.confirmacoes
            if c.tipo_confirmante == "cliente_contato" and c.cliente_contato_id == contato_id
        ],
        "created_at": dado.created_at,
    }



@router.get("/documentos")
async def listar_documentos_portal(
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(DocumentoAcordo).where(DocumentoAcordo.cliente_id == contato.cliente_id)
    if not pode(contato.portal_papel, "ver_todas", contato.portal_capacidades):
        # Quem não administra a instituição só lê acordos em que figura como confirmante.
        stmt = stmt.join(DocumentoConfirmacao, DocumentoConfirmacao.documento_acordo_id == DocumentoAcordo.id).where(
            DocumentoConfirmacao.tipo_confirmante == "cliente_contato",
            DocumentoConfirmacao.cliente_contato_id == contato.id,
        )
    result = await db.execute(stmt.order_by(DocumentoAcordo.created_at.desc()))
    return [projetar_documento_cliente(await serializar_documento(db, d), contato.id) for d in result.scalars().all()]


@router.post("/documentos/{documento_id}/confirmar")
async def confirmar_documento_portal(
    documento_id: int,
    request: Request,
    contato: Annotated[ClienteContato, Depends(get_current_cliente_contato)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    alvo = await db.get(DocumentoAcordo, documento_id)
    if alvo is None or alvo.cliente_id != contato.cliente_id:
        raise HTTPException(404, "Documento não encontrado")
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    documento = await confirmar_como_cliente_contato(db, documento_id, contato.id, ip, user_agent)
    await db.commit()
    return projetar_documento_cliente(await serializar_documento(db, documento), contato.id)

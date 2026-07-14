"""Portal do Cliente — Módulo C: Documento de Aditivo/Acordo (gestão interna)."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_envoxer, get_current_gestor_ou_admin
from app.db.session import get_db
from app.models.envoxer import Envoxer
from app.models.cliente import Cliente
from app.models.documento_acordo import DocumentoAcordo
from app.models.documento_confirmacao import DocumentoConfirmacao
from app.schemas.documento_acordo import DocumentoAcordoCreate, DocumentoAcordoResponse, ItemAlteradoResponse, DocumentoConfirmacaoResponse
from app.services.documentos_acordo import criar_documento_acordo, confirmar_como_envoxer, cancelar_documento_acordo

router = APIRouter(tags=["documento-acordo"])


async def _get_cliente_ou_404(db: AsyncSession, cliente_id: int) -> Cliente:
    result = await db.execute(select(Cliente).where(Cliente.id == cliente_id, Cliente.deleted_at.is_(None)))
    cliente = result.scalar_one_or_none()
    if cliente is None:
        raise HTTPException(status_code=404, detail="Cliente não encontrado")
    return cliente


async def serializar_documento(db: AsyncSession, documento: DocumentoAcordo) -> DocumentoAcordoResponse:
    cliente = (await db.execute(select(Cliente).where(Cliente.id == documento.cliente_id))).scalar_one_or_none()
    criador = None
    if documento.criado_por_envoxer_id:
        criador = (await db.execute(select(Envoxer).where(Envoxer.id == documento.criado_por_envoxer_id))).scalar_one_or_none()

    confirmacoes_result = await db.execute(
        select(DocumentoConfirmacao).where(DocumentoConfirmacao.documento_acordo_id == documento.id).order_by(DocumentoConfirmacao.id)
    )
    confirmacoes = [
        DocumentoConfirmacaoResponse(
            id=c.id, tipo_confirmante=c.tipo_confirmante, envoxer_id=c.envoxer_id, cliente_contato_id=c.cliente_contato_id,
            nome_snapshot=c.nome_snapshot, email_snapshot=c.email_snapshot,
            confirmado_em=c.confirmado_em, ip=c.ip,
        )
        for c in confirmacoes_result.scalars().all()
    ]

    return DocumentoAcordoResponse(
        id=documento.id, cliente_id=documento.cliente_id, cliente_nome=cliente.nome if cliente else None,
        tipo=documento.tipo, motivo=documento.motivo,
        itens_alterados=[ItemAlteradoResponse(**i) for i in documento.itens_alterados],
        status=documento.status, confirmacoes=confirmacoes,
        criado_por_nome=criador.nome if criador else None,
        vigente_em=documento.vigente_em, cancelado_em=documento.cancelado_em, created_at=documento.created_at,
    )


@router.get("/clientes/{cliente_id}/documentos-acordo", response_model=list[DocumentoAcordoResponse])
async def listar_documentos_acordo(
    cliente_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    await _get_cliente_ou_404(db, cliente_id)
    result = await db.execute(
        select(DocumentoAcordo).where(DocumentoAcordo.cliente_id == cliente_id).order_by(DocumentoAcordo.created_at.desc())
    )
    return [await serializar_documento(db, d) for d in result.scalars().all()]


@router.post("/clientes/{cliente_id}/documentos-acordo", response_model=DocumentoAcordoResponse, status_code=201)
async def criar_documento_acordo_rota(
    cliente_id: int,
    payload: DocumentoAcordoCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    await _get_cliente_ou_404(db, cliente_id)
    documento = await criar_documento_acordo(db, cliente_id, payload, envoxer.id)
    await db.commit()
    return await serializar_documento(db, documento)


@router.get("/documentos-acordo/{documento_id}", response_model=DocumentoAcordoResponse)
async def obter_documento_acordo(
    documento_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    documento = (await db.execute(select(DocumentoAcordo).where(DocumentoAcordo.id == documento_id))).scalar_one_or_none()
    if documento is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return await serializar_documento(db, documento)


@router.post("/documentos-acordo/{documento_id}/confirmar", response_model=DocumentoAcordoResponse)
async def confirmar_documento_acordo_rota(
    documento_id: int,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
):
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    documento = await confirmar_como_envoxer(db, documento_id, envoxer.id, ip, user_agent)
    await db.commit()
    return await serializar_documento(db, documento)


@router.post("/documentos-acordo/{documento_id}/cancelar", response_model=DocumentoAcordoResponse)
async def cancelar_documento_acordo_rota(
    documento_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    _: Annotated[Envoxer, Depends(get_current_gestor_ou_admin)],
):
    documento = await cancelar_documento_acordo(db, documento_id)
    await db.commit()
    return await serializar_documento(db, documento)

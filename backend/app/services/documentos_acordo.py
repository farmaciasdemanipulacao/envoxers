"""Documento de Aditivo/Acordo — cria com os itens que mudam de quantidade e
quem precisa confirmar (internos + contato(s) do cliente). Só vira "vigente"
(e só aí atualiza o ItemEscopo de verdade) quando TODAS as confirmações
acontecerem — regra confirmada pelo Gus."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select

from app.models.envoxer import Envoxer
from app.models.cliente_contato import ClienteContato
from app.models.item_escopo import ItemEscopo
from app.models.documento_acordo import DocumentoAcordo
from app.models.documento_confirmacao import DocumentoConfirmacao
from app.schemas.documento_acordo import DocumentoAcordoCreate
from app.services.entregaveis import aplicar_mudanca_quantidade


async def criar_documento_acordo(db, cliente_id: int, payload: DocumentoAcordoCreate, criado_por_envoxer_id: int) -> DocumentoAcordo:
    if not payload.itens:
        raise HTTPException(status_code=400, detail="selecione ao menos 1 item de escopo pra alterar")
    if not payload.envoxer_ids and not payload.cliente_contato_ids:
        raise HTTPException(status_code=400, detail="selecione ao menos 1 pessoa pra confirmar")

    itens_alterados = []
    for entrada in payload.itens:
        item = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == entrada.item_escopo_id, ItemEscopo.cliente_id == cliente_id))).scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail=f"item de escopo {entrada.item_escopo_id} não encontrado pra este cliente")
        itens_alterados.append({
            "item_escopo_id": item.id, "tipo": item.tipo, "descricao": item.descricao,
            "quantidade_anterior": item.quantidade, "quantidade_nova": entrada.quantidade_nova,
        })

    documento = DocumentoAcordo(
        cliente_id=cliente_id, motivo=payload.motivo, itens_alterados=itens_alterados,
        criado_por_envoxer_id=criado_por_envoxer_id,
    )
    db.add(documento)
    await db.flush()

    for envoxer_id in payload.envoxer_ids:
        envoxer = (await db.execute(select(Envoxer).where(Envoxer.id == envoxer_id))).scalar_one_or_none()
        if envoxer is None:
            raise HTTPException(status_code=404, detail=f"envoxer {envoxer_id} não encontrado")
        db.add(DocumentoConfirmacao(
            documento_acordo_id=documento.id, tipo_confirmante="envoxer", envoxer_id=envoxer.id,
            nome_snapshot=envoxer.nome, email_snapshot=envoxer.email,
        ))

    for contato_id in payload.cliente_contato_ids:
        contato = (await db.execute(select(ClienteContato).where(ClienteContato.id == contato_id, ClienteContato.cliente_id == cliente_id))).scalar_one_or_none()
        if contato is None:
            raise HTTPException(status_code=404, detail=f"contato {contato_id} não encontrado pra este cliente")
        db.add(DocumentoConfirmacao(
            documento_acordo_id=documento.id, tipo_confirmante="cliente_contato", cliente_contato_id=contato.id,
            nome_snapshot=contato.nome, email_snapshot=contato.email,
        ))

    await db.flush()
    await db.refresh(documento)
    return documento


async def _todas_confirmadas(db, documento_id: int) -> bool:
    result = await db.execute(select(DocumentoConfirmacao).where(DocumentoConfirmacao.documento_acordo_id == documento_id))
    confirmacoes = result.scalars().all()
    return len(confirmacoes) > 0 and all(c.confirmado_em is not None for c in confirmacoes)


async def _efetivar_documento(db, documento: DocumentoAcordo) -> None:
    """Aplica de fato as novas quantidades — chamado só quando TODAS as
    confirmações já aconteceram."""
    for entrada in documento.itens_alterados:
        item = (await db.execute(select(ItemEscopo).where(ItemEscopo.id == entrada["item_escopo_id"]))).scalar_one_or_none()
        if item is None:
            continue  # item pode ter sido excluído entre a criação do documento e a confirmação
        await aplicar_mudanca_quantidade(
            db, item, entrada["quantidade_nova"], motivo=documento.motivo,
            alterado_por_envoxer_id=documento.criado_por_envoxer_id, documento_acordo_id=documento.id,
        )
    documento.status = "vigente"
    documento.vigente_em = datetime.now(timezone.utc)


async def confirmar_como_envoxer(db, documento_id: int, envoxer_id: int, ip: Optional[str], user_agent: Optional[str]) -> DocumentoAcordo:
    return await _confirmar(db, documento_id, "envoxer", envoxer_id, ip, user_agent)


async def confirmar_como_cliente_contato(db, documento_id: int, cliente_contato_id: int, ip: Optional[str], user_agent: Optional[str]) -> DocumentoAcordo:
    return await _confirmar(db, documento_id, "cliente_contato", cliente_contato_id, ip, user_agent)


async def _confirmar(db, documento_id: int, tipo_confirmante: str, pessoa_id: int, ip: Optional[str], user_agent: Optional[str]) -> DocumentoAcordo:
    documento = (await db.execute(select(DocumentoAcordo).where(DocumentoAcordo.id == documento_id))).scalar_one_or_none()
    if documento is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if documento.status != "aguardando_confirmacoes":
        raise HTTPException(status_code=400, detail=f"documento já está '{documento.status}', não aceita mais confirmações")

    campo = "envoxer_id" if tipo_confirmante == "envoxer" else "cliente_contato_id"
    result = await db.execute(
        select(DocumentoConfirmacao).where(
            DocumentoConfirmacao.documento_acordo_id == documento_id,
            DocumentoConfirmacao.tipo_confirmante == tipo_confirmante,
            getattr(DocumentoConfirmacao, campo) == pessoa_id,
        )
    )
    confirmacao = result.scalar_one_or_none()
    if confirmacao is None:
        raise HTTPException(status_code=403, detail="você não foi convidado a confirmar este documento")

    if confirmacao.confirmado_em is None:
        confirmacao.confirmado_em = datetime.now(timezone.utc)
        confirmacao.ip = ip
        confirmacao.user_agent = user_agent
        await db.flush()

    if await _todas_confirmadas(db, documento_id):
        await _efetivar_documento(db, documento)

    await db.flush()
    await db.refresh(documento)
    return documento


async def cancelar_documento_acordo(db, documento_id: int) -> DocumentoAcordo:
    documento = (await db.execute(select(DocumentoAcordo).where(DocumentoAcordo.id == documento_id))).scalar_one_or_none()
    if documento is None:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    if documento.status != "aguardando_confirmacoes":
        raise HTTPException(status_code=400, detail=f"documento já está '{documento.status}', não pode ser cancelado")
    documento.status = "cancelado"
    documento.cancelado_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(documento)
    return documento

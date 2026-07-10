"""Chat interno — canal geral, canal por cliente (auto-provisionado) e DMs 1:1.

Envio de mensagem é sempre via POST REST (persiste e depois notifica via WS);
o WebSocket só empurra eventos para quem está conectado, não recebe conteúdo.
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.api.deps import get_current_envoxer
from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.chat_canal import ChatCanal
from app.models.chat_leitura import ChatLeitura
from app.models.chat_mensagem import ChatMensagem
from app.models.cliente import Cliente
from app.models.envoxer import Envoxer
from app.schemas.chat import ChatCanalResponse, ChatMensagemCreate, ChatMensagemResponse
from app.services.chat_ws_manager import chat_ws_manager

router = APIRouter(prefix="/chat", tags=["chat"])

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


async def _get_or_create_canal_geral(db: AsyncSession) -> ChatCanal:
    result = await db.execute(select(ChatCanal).where(ChatCanal.tipo == "geral"))
    canal = result.scalar_one_or_none()
    if canal is None:
        canal = ChatCanal(tipo="geral")
        db.add(canal)
        await db.flush()
    return canal


async def _get_or_create_canal_cliente(db: AsyncSession, cliente_id: int) -> ChatCanal:
    result = await db.execute(
        select(ChatCanal).where(ChatCanal.tipo == "cliente", ChatCanal.cliente_id == cliente_id)
    )
    canal = result.scalar_one_or_none()
    if canal is None:
        canal = ChatCanal(tipo="cliente", cliente_id=cliente_id)
        db.add(canal)
        await db.flush()
    return canal


async def _get_or_create_canal_dm(db: AsyncSession, envoxer_id_1: int, envoxer_id_2: int) -> ChatCanal:
    a, b = sorted((envoxer_id_1, envoxer_id_2))
    result = await db.execute(
        select(ChatCanal).where(
            ChatCanal.tipo == "dm", ChatCanal.dm_envoxer_a_id == a, ChatCanal.dm_envoxer_b_id == b
        )
    )
    canal = result.scalar_one_or_none()
    if canal is None:
        canal = ChatCanal(tipo="dm", dm_envoxer_a_id=a, dm_envoxer_b_id=b)
        db.add(canal)
        await db.flush()
    return canal


def _validar_acesso_dm(canal: ChatCanal, envoxer: Envoxer):
    if canal.tipo == "dm" and envoxer.id not in (canal.dm_envoxer_a_id, canal.dm_envoxer_b_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este canal")


async def _nao_lidas(db: AsyncSession, canal_id: int, envoxer_id: int) -> int:
    result = await db.execute(
        select(ChatLeitura.last_read_at).where(
            ChatLeitura.canal_id == canal_id, ChatLeitura.envoxer_id == envoxer_id
        )
    )
    last_read_at = result.scalar_one_or_none() or EPOCH
    result = await db.execute(
        select(func.count()).select_from(ChatMensagem).where(
            ChatMensagem.canal_id == canal_id,
            ChatMensagem.created_at > last_read_at,
            ChatMensagem.autor_envoxer_id != envoxer_id,
        )
    )
    return result.scalar_one()


async def _ultima_mensagem(db: AsyncSession, canal_id: int) -> Optional[ChatMensagemResponse]:
    result = await db.execute(
        select(ChatMensagem, Envoxer.nome, Envoxer.foto_url)
        .join(Envoxer, Envoxer.id == ChatMensagem.autor_envoxer_id)
        .where(ChatMensagem.canal_id == canal_id)
        .order_by(ChatMensagem.id.desc())
        .limit(1)
    )
    row = result.first()
    if row is None:
        return None
    msg, autor_nome, autor_foto = row
    return ChatMensagemResponse(
        id=msg.id, canal_id=msg.canal_id, autor_envoxer_id=msg.autor_envoxer_id,
        autor_nome=autor_nome, autor_foto=autor_foto, texto=msg.texto, anexo_url=msg.anexo_url,
        created_at=msg.created_at,
    )


async def _montar_resposta(
    db: AsyncSession, canal: ChatCanal, envoxer_id: int,
    nome_override: Optional[str] = None, outro_id: Optional[int] = None,
) -> ChatCanalResponse:
    nome = nome_override or "Geral"
    return ChatCanalResponse(
        id=canal.id, tipo=canal.tipo, nome=nome, cliente_id=canal.cliente_id,
        outro_envoxer_id=outro_id,
        nao_lidas=await _nao_lidas(db, canal.id, envoxer_id),
        ultima_mensagem=await _ultima_mensagem(db, canal.id),
    )


@router.get("/canais", response_model=list[ChatCanalResponse])
async def listar_canais(
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    canais_resp = []

    canal_geral = await _get_or_create_canal_geral(db)
    canais_resp.append(await _montar_resposta(db, canal_geral, envoxer.id))

    result = await db.execute(
        select(Cliente).where(Cliente.ativo == True, Cliente.deleted_at.is_(None)).order_by(Cliente.nome)  # noqa: E712
    )
    for cliente in result.scalars().all():
        canal = await _get_or_create_canal_cliente(db, cliente.id)
        canais_resp.append(await _montar_resposta(db, canal, envoxer.id, nome_override=cliente.nome))

    result = await db.execute(
        select(ChatCanal).where(
            ChatCanal.tipo == "dm",
            or_(ChatCanal.dm_envoxer_a_id == envoxer.id, ChatCanal.dm_envoxer_b_id == envoxer.id),
        )
    )
    for canal in result.scalars().all():
        outro_id = canal.dm_envoxer_b_id if canal.dm_envoxer_a_id == envoxer.id else canal.dm_envoxer_a_id
        outro = await db.get(Envoxer, outro_id)
        canais_resp.append(
            await _montar_resposta(db, canal, envoxer.id, nome_override=outro.nome if outro else "—", outro_id=outro_id)
        )

    return canais_resp


@router.post("/dm/{outro_envoxer_id}", response_model=ChatCanalResponse)
async def abrir_dm(
    outro_envoxer_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if outro_envoxer_id == envoxer.id:
        raise HTTPException(status_code=400, detail="Não é possível abrir DM consigo mesmo")
    outro = await db.get(Envoxer, outro_envoxer_id)
    if outro is None:
        raise HTTPException(status_code=404, detail="Envoxer não encontrado")

    canal = await _get_or_create_canal_dm(db, envoxer.id, outro_envoxer_id)
    return await _montar_resposta(db, canal, envoxer.id, nome_override=outro.nome, outro_id=outro_envoxer_id)


@router.get("/canais/{canal_id}/mensagens", response_model=list[ChatMensagemResponse])
async def listar_mensagens(
    canal_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    before_id: Optional[int] = Query(None),
    limit: int = Query(50, le=200),
):
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    stmt = (
        select(ChatMensagem, Envoxer.nome, Envoxer.foto_url)
        .join(Envoxer, Envoxer.id == ChatMensagem.autor_envoxer_id)
        .where(ChatMensagem.canal_id == canal_id)
    )
    if before_id:
        stmt = stmt.where(ChatMensagem.id < before_id)
    stmt = stmt.order_by(ChatMensagem.id.desc()).limit(limit)

    result = await db.execute(stmt)
    mensagens = [
        ChatMensagemResponse(
            id=m.id, canal_id=m.canal_id, autor_envoxer_id=m.autor_envoxer_id,
            autor_nome=nome, autor_foto=foto, texto=m.texto, anexo_url=m.anexo_url, created_at=m.created_at,
        )
        for m, nome, foto in result.all()
    ]
    mensagens.reverse()
    return mensagens


@router.post("/canais/{canal_id}/mensagens", response_model=ChatMensagemResponse)
async def enviar_mensagem(
    canal_id: int,
    payload: ChatMensagemCreate,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    texto = (payload.texto or "").strip() or None
    if not texto and not payload.anexo_url:
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    mensagem = ChatMensagem(canal_id=canal_id, autor_envoxer_id=envoxer.id, texto=texto, anexo_url=payload.anexo_url)
    db.add(mensagem)
    await db.flush()
    await db.refresh(mensagem)

    resposta = ChatMensagemResponse(
        id=mensagem.id, canal_id=canal_id, autor_envoxer_id=envoxer.id,
        autor_nome=envoxer.nome, autor_foto=envoxer.foto_url,
        texto=mensagem.texto, anexo_url=mensagem.anexo_url, created_at=mensagem.created_at,
    )

    payload_ws = {"tipo": "mensagem_nova", "canal_id": canal_id, "mensagem": resposta.model_dump(mode="json")}
    if canal.tipo == "dm":
        await chat_ws_manager.broadcast_dm(canal.dm_envoxer_a_id, canal.dm_envoxer_b_id, payload_ws)
    else:
        result = await db.execute(select(Envoxer.id).where(Envoxer.ativo == True))  # noqa: E712
        ids_ativos = [row[0] for row in result.all()]
        await chat_ws_manager.broadcast_geral_ou_cliente(ids_ativos, payload_ws)

    return resposta


@router.post("/canais/{canal_id}/ler", status_code=status.HTTP_204_NO_CONTENT)
async def marcar_lido(
    canal_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    agora = datetime.now(timezone.utc)
    result = await db.execute(
        select(ChatLeitura).where(ChatLeitura.canal_id == canal_id, ChatLeitura.envoxer_id == envoxer.id)
    )
    leitura = result.scalar_one_or_none()
    if leitura is None:
        db.add(ChatLeitura(envoxer_id=envoxer.id, canal_id=canal_id, last_read_at=agora))
    else:
        leitura.last_read_at = agora


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, token: str = Query(...)):
    payload = decode_access_token(token)
    if payload is None or payload.get("sub") is None:
        await websocket.close(code=4401)
        return
    envoxer_id = int(payload["sub"])

    await chat_ws_manager.conectar(envoxer_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # mantém a conexão viva; conteúdo recebido é ignorado
    except WebSocketDisconnect:
        pass
    finally:
        chat_ws_manager.desconectar(envoxer_id, websocket)

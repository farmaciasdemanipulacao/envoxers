"""Chat interno — canal geral, canal por cliente (auto-provisionado) e DMs 1:1.

Envio de mensagem é sempre via POST REST (persiste e depois notifica via WS);
o WebSocket empurra eventos pra quem está conectado e recebe só sinais de
visibilidade da aba do cliente (usado pra decidir push de mensagem nova).
"""
import json
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func

from app.api.deps import get_current_envoxer
from app.core.security import decode_access_token
from app.core.uploads import excluir_upload_url, salvar_upload
from app.db.session import get_db, AsyncSessionLocal
from app.models.sessao_web import SessaoWeb
from app.services.sessoes_web import valida_sessao
from app.models.chat_canal import ChatCanal
from app.models.chat_leitura import ChatLeitura
from app.models.chat_mensagem import ChatMensagem
from app.models.chat_mensagem_reacao import ChatMensagemReacao
from app.models.cliente import Cliente
from app.models.envoxer import Envoxer
from app.models.alerta_config import AlertaConfig
from app.schemas.chat import (
    ChatCanalResponse, ChatMensagemCreate, ChatMensagemEdit, ChatMensagemResponse, ChatCitacaoResponse, ChatBloqueioResponse, ChatCanalPendenteItem,
    ChatReacaoCreate, ChatReacaoCount, ChatReacaoToggleResponse, ChatLeituraResponse,
)
from app.services.chat_ws_manager import chat_ws_manager

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

# Paleta moderada: somente emojis exibidos no próprio seletor são aceitos pela API.
CHAT_REACTION_EMOJIS = frozenset((
    "👍", "❤️", "😂", "😍", "😮", "😢", "🙏", "👏", "🔥", "🎉",
    "🙌", "✅", "💙", "👀", "🤝", "🚀", "💪", "😀", "👎", "💯",
))


def _prazo_um_dia_util(criado_em: datetime) -> datetime:
    """Um dia útil a partir do envio, pulando sábado/domingo.

    Ex.: sexta 15h -> segunda 15h. Mantém o horário original e não depende
    de scheduler; a permissão é calculada ao vivo em cada leitura/ação.
    """
    base = criado_em if criado_em.tzinfo else criado_em.replace(tzinfo=timezone.utc)
    prazo = base + timedelta(days=1)
    while prazo.weekday() >= 5:
        prazo += timedelta(days=1)
    return prazo


def _prazo_edicao_mensagem(criado_em: datetime) -> datetime:
    base = criado_em if criado_em.tzinfo else criado_em.replace(tzinfo=timezone.utc)
    return base + timedelta(days=1)


def _pode_editar_mensagem(mensagem: ChatMensagem, envoxer_id: int) -> bool:
    if mensagem.autor_envoxer_id != envoxer_id or mensagem.excluida_para_todos_em is not None:
        return False
    return datetime.now(timezone.utc) <= _prazo_edicao_mensagem(mensagem.created_at)


def _pode_excluir_mensagem(mensagem: ChatMensagem, envoxer_id: int) -> bool:
    if mensagem.autor_envoxer_id != envoxer_id or mensagem.excluida_para_todos_em is not None:
        return False
    return datetime.now(timezone.utc) <= _prazo_um_dia_util(mensagem.created_at)


def _mensagem_response(
    mensagem: ChatMensagem, autor_nome: str, autor_foto: Optional[str],
    viewer_id: Optional[int] = None, citacao: Optional[ChatCitacaoResponse] = None,
    reacoes: Optional[list[ChatReacaoCount]] = None,
    minhas_reacoes: Optional[list[str]] = None,
) -> ChatMensagemResponse:
    prazo_edicao = _prazo_edicao_mensagem(mensagem.created_at)
    prazo_exclusao = _prazo_um_dia_util(mensagem.created_at)
    pode_editar = viewer_id is not None and _pode_editar_mensagem(mensagem, viewer_id)
    pode_excluir = viewer_id is not None and _pode_excluir_mensagem(mensagem, viewer_id)
    return ChatMensagemResponse(
        id=mensagem.id, canal_id=mensagem.canal_id, autor_envoxer_id=mensagem.autor_envoxer_id,
        resposta_a_id=mensagem.resposta_a_id, resposta_a=citacao,
        autor_nome=autor_nome, autor_foto=autor_foto, texto=mensagem.texto, anexo_url=mensagem.anexo_url,
        anexo_nome=mensagem.anexo_nome, anexo_mime_type=mensagem.anexo_mime_type,
        anexo_tamanho_kb=mensagem.anexo_tamanho_kb,
        created_at=mensagem.created_at, editado_em=mensagem.editado_em,
        excluida_para_todos_em=mensagem.excluida_para_todos_em,
        prazo_edicao=prazo_edicao, prazo_exclusao=prazo_exclusao,
        pode_editar=pode_editar, pode_excluir=pode_excluir,
        reacoes=reacoes or [], minhas_reacoes=minhas_reacoes or [],
    )


async def _carregar_reacoes(
    db: AsyncSession, mensagens: list[ChatMensagem], viewer_id: Optional[int]
) -> dict[int, tuple[list[ChatReacaoCount], list[str]]]:
    """Reações de todo o conjunto em uma consulta, sem N+1."""
    ids = [m.id for m in mensagens if m.excluida_para_todos_em is None]
    if not ids:
        return {}
    result = await db.execute(
        select(ChatMensagemReacao.mensagem_id, ChatMensagemReacao.envoxer_id, ChatMensagemReacao.emoji)
        .where(ChatMensagemReacao.mensagem_id.in_(ids))
    )
    grupos: dict[int, dict[str, int]] = {}
    minhas: dict[int, list[str]] = {}
    for mensagem_id, autor_id, emoji in result.all():
        contagens = grupos.setdefault(mensagem_id, {})
        contagens[emoji] = contagens.get(emoji, 0) + 1
        if viewer_id == autor_id:
            minhas.setdefault(mensagem_id, []).append(emoji)
    return {
        mid: (
            [ChatReacaoCount(emoji=e, quantidade=q) for e, q in sorted(counts.items())],
            minhas.get(mid, []),
        )
        for mid, counts in grupos.items()
    }


async def _carregar_citacoes(db: AsyncSession, mensagens: list[ChatMensagem]) -> dict[int, ChatCitacaoResponse]:
    """Carrega em lote as mensagens citadas, sempre no canal da mensagem que responde."""
    ids = {m.resposta_a_id for m in mensagens if m.resposta_a_id is not None}
    if not ids:
        return {}
    result = await db.execute(
        select(ChatMensagem, Envoxer.nome)
        .join(Envoxer, Envoxer.id == ChatMensagem.autor_envoxer_id)
        .where(ChatMensagem.id.in_(ids))
    )
    return {
        msg.id: ChatCitacaoResponse(
            id=msg.id, autor_nome=nome,
            texto=None if msg.excluida_para_todos_em else msg.texto,
            anexo_nome=None if msg.excluida_para_todos_em else msg.anexo_nome,
            excluida=msg.excluida_para_todos_em is not None,
        )
        for msg, nome in result.all()
    }


async def _broadcast_evento_mensagem(db: AsyncSession, canal: ChatCanal, payload_ws: dict) -> None:
    # Falhas de push/WebSocket não podem transformar um envio já salvo em erro:
    # isso faria o cliente reenviar e duplicaria mensagens.
    try:
        if canal.tipo == "dm":
            await chat_ws_manager.broadcast_dm(canal.dm_envoxer_a_id, canal.dm_envoxer_b_id, payload_ws)
            return
        result = await db.execute(select(Envoxer.id).where(Envoxer.ativo == True))  # noqa: E712
        await chat_ws_manager.broadcast_geral_ou_cliente([row[0] for row in result.all()], payload_ws)


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
                ChatMensagem.excluida_para_todos_em.is_(None),
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
        citacoes = await _carregar_citacoes(db, [msg])
        return _mensagem_response(msg, autor_nome, autor_foto, citacao=citacoes.get(msg.resposta_a_id))


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


    @router.get("/presenca", response_model=dict[int, str])
    async def obter_presenca(
        _: Annotated[Envoxer, Depends(get_current_envoxer)],
    ):
        """Snapshot pra popular o status (ativo/ausente/off) de todo mundo assim que o
        app abre — depois disso o front só recebe atualizações via WS (evento "presenca",
        disparado por chat_ws_manager em toda conexão/desconexão/mudança de visibilidade).
        Quem não aparece aqui nunca conectou nesta sessão do processo — o front trata
        ausência de entrada como offline."""
        return chat_ws_manager.snapshot_presenca()


    @router.get("/bloqueio", response_model=ChatBloqueioResponse)
    async def verificar_bloqueio(
        envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
        db: Annotated[AsyncSession, Depends(get_db)],
    ):
        """DM não lida desde ANTES de hoje (passou da meia-noite sem a pessoa abrir)
        bloqueia o app inteiro pra quem recebeu — só o Chat continua acessível, com
        aviso, até ler. Calculado ao vivo a cada chamada (sem scheduler, mesmo padrão
        do resto do projeto) — assim que a pessoa abre a conversa e a mensagem entra
        dentro de `ChatLeitura.last_read_at`, a próxima checagem já destrava sozinha.
        Admin nunca bloqueia (decisão do Gus)."""
        if envoxer.permissao == "admin":
            return ChatBloqueioResponse(bloqueado=False, canais=[])

        # A regra é "mensagem do dia anterior" no dia local da equipe, não em UTC.
        # Curitiba/São Paulo = America/Sao_Paulo; sem isso, mensagens do fim da noite
        # podiam cair no "dia UTC" seguinte e escapar do bloqueio na manhã seguinte.
        agora_local = datetime.now(ZoneInfo("America/Sao_Paulo"))
        hoje_00h = agora_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

        result = await db.execute(
            select(ChatCanal).where(
                ChatCanal.tipo == "dm",
                or_(ChatCanal.dm_envoxer_a_id == envoxer.id, ChatCanal.dm_envoxer_b_id == envoxer.id),
            )
        )
        canais_pendentes = []
        for canal in result.scalars().all():
            leitura_result = await db.execute(
                select(ChatLeitura.last_read_at).where(
                    ChatLeitura.canal_id == canal.id, ChatLeitura.envoxer_id == envoxer.id
                )
            )
            last_read_at = leitura_result.scalar_one_or_none() or EPOCH

            qtd_result = await db.execute(
                select(func.count()).select_from(ChatMensagem).where(
                    ChatMensagem.canal_id == canal.id,
                    ChatMensagem.created_at > last_read_at,
                    ChatMensagem.created_at < hoje_00h,
                    ChatMensagem.autor_envoxer_id != envoxer.id,
                    ChatMensagem.excluida_para_todos_em.is_(None),
                )
            )
            qtd_pendente = qtd_result.scalar_one()
            if qtd_pendente > 0:
                outro_id = canal.dm_envoxer_b_id if canal.dm_envoxer_a_id == envoxer.id else canal.dm_envoxer_a_id
                outro = await db.get(Envoxer, outro_id)
                canais_pendentes.append(
                    ChatCanalPendenteItem(
                        canal_id=canal.id,
                        outro_envoxer_id=outro_id,
                        outro_envoxer_nome=outro.nome if outro else "—",
                        outro_envoxer_foto=outro.foto_url if outro else None,
                        qtd_pendente=qtd_pendente,
                    )
                )

        return ChatBloqueioResponse(bloqueado=len(canais_pendentes) > 0, canais=canais_pendentes)


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
        rows = result.all()
        encontrados = [m for m, _, _ in rows]
        citacoes = await _carregar_citacoes(db, encontrados)
        reacoes = await _carregar_reacoes(db, encontrados, envoxer.id)
        mensagens = [
            _mensagem_response(
                m, nome, foto, envoxer.id, citacoes.get(m.resposta_a_id),
                *reacoes.get(m.id, ([], [])),
            )
            for m, nome, foto in rows
        ]
        mensagens.reverse()
        return mensagens


    async def _enviar_mensagem_core(
        canal_id: int,
        envoxer: Envoxer,
        db: AsyncSession,
        *,
        texto: Optional[str] = None,
        anexo_url: Optional[str] = None,
        anexo_nome: Optional[str] = None,
        anexo_mime_type: Optional[str] = None,
        anexo_tamanho_kb: Optional[int] = None,
        resposta_a_id: Optional[int] = None,
    ) -> ChatMensagemResponse:
        texto_limpo = (texto or "").strip() or None
        if not texto_limpo and not anexo_url:
            raise HTTPException(status_code=400, detail="Mensagem vazia")

        canal = await db.get(ChatCanal, canal_id)
        if canal is None:
            raise HTTPException(status_code=404, detail="Canal não encontrado")
        _validar_acesso_dm(canal, envoxer)

        citacao = None
        if resposta_a_id is not None:
            original = await db.get(ChatMensagem, resposta_a_id)
            if original is None or original.canal_id != canal_id:
                raise HTTPException(status_code=400, detail="A mensagem respondida não pertence a esta conversa")
            if original.excluida_para_todos_em is not None:
                raise HTTPException(status_code=400, detail="Não é possível responder a uma mensagem excluída")
            autor_original = await db.get(Envoxer, original.autor_envoxer_id)
            citacao = ChatCitacaoResponse(
                id=original.id, autor_nome=autor_original.nome if autor_original else "Usuário",
                texto=original.texto, anexo_nome=original.anexo_nome,
            )

        mensagem = ChatMensagem(
            canal_id=canal_id,
            autor_envoxer_id=envoxer.id,
            resposta_a_id=resposta_a_id,
            texto=texto_limpo,
            anexo_url=anexo_url,
            anexo_nome=anexo_nome,
            anexo_mime_type=anexo_mime_type,
            anexo_tamanho_kb=anexo_tamanho_kb,
        )
        db.add(mensagem)
        await db.flush()
        await db.refresh(mensagem)
        # Recebedores podem confirmar leitura assim que o WebSocket chegar.
        # A mensagem precisa estar comprometida no banco ANTES de avisá-los.
        await db.commit()

        resposta = _mensagem_response(mensagem, envoxer.nome, envoxer.foto_url, envoxer.id, citacao)
        payload_ws = {"tipo": "mensagem_nova", "canal_id": canal_id, "mensagem": resposta.model_dump(mode="json")}

        if canal.tipo == "dm":
            await chat_ws_manager.broadcast_dm(canal.dm_envoxer_a_id, canal.dm_envoxer_b_id, payload_ws)
            destinatario_id = canal.dm_envoxer_b_id if canal.dm_envoxer_a_id == envoxer.id else canal.dm_envoxer_a_id
            if not chat_ws_manager.esta_acompanhando_canal(destinatario_id, canal_id):
                config_result = await db.execute(select(AlertaConfig).where(AlertaConfig.chave == "chat_dm"))
                config_chat = config_result.scalar_one_or_none()
                if config_chat is None or config_chat.ativo:
                    from app.services.push import broadcast_push
                    await broadcast_push(
                        db,
                        destinatario_id,
                        title=envoxer.nome,
                        body=(texto_limpo or f"Enviou {anexo_nome or 'um anexo'}")[:180],
                        tag="envoxers-chat",
                    )
        else:
            result = await db.execute(select(Envoxer.id).where(Envoxer.ativo == True))  # noqa: E712
            ids_ativos = [row[0] for row in result.all()]
            await chat_ws_manager.broadcast_geral_ou_cliente(ids_ativos, payload_ws)

            config_result = await db.execute(select(AlertaConfig).where(AlertaConfig.chave == "chat_geral"))
            config_geral = config_result.scalar_one_or_none()
            if config_geral is None or config_geral.ativo:
                from app.services.push import broadcast_push
                titulo = f"{envoxer.nome} · geral" if canal.tipo == "geral" else f"{envoxer.nome} · cliente"
                for destinatario_id in ids_ativos:
                    if destinatario_id == envoxer.id or chat_ws_manager.esta_acompanhando_canal(destinatario_id, canal_id):
                        continue
                    await broadcast_push(
                        db,
                        destinatario_id,
                        title=titulo,
                        body=(texto_limpo or f"Enviou {anexo_nome or 'um anexo'}")[:180],
                        tag="envoxers-chat",
                    )
    except Exception:
        await db.rollback()
        logger.exception("Falha ao notificar mensagem já persistida: canal=%s mensagem=%s", canal_id, mensagem.id)
    return resposta


@router.post("/canais/{canal_id}/mensagens", response_model=ChatMensagemResponse)
async def enviar_mensagem(
    canal_id: int,
    payload: ChatMensagemCreate,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await _enviar_mensagem_core(
        canal_id,
        envoxer,
        db,
        texto=payload.texto,
        anexo_url=payload.anexo_url,
        resposta_a_id=payload.resposta_a_id,
    )


@router.post("/canais/{canal_id}/mensagens-com-anexo", response_model=ChatMensagemResponse)
async def enviar_mensagem_com_anexo(
    canal_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    texto: str = Form(""),
    resposta_a_id: Optional[int] = Form(None),
    arquivo: UploadFile = File(...),
):
    salvo = await salvar_upload(arquivo)
    try:
        return await _enviar_mensagem_core(
            canal_id,
            envoxer,
            db,
            texto=texto,
            anexo_url=salvo["url"],
            anexo_nome=salvo["nome"],
            anexo_mime_type=salvo.get("mime_type"),
            anexo_tamanho_kb=salvo.get("tamanho_kb"),
            resposta_a_id=resposta_a_id,
        )
    except Exception:
        excluir_upload_url(salvo.get("url"))
        raise



@router.post("/canais/{canal_id}/mensagens/{mensagem_id}/reacoes", response_model=ChatReacaoToggleResponse)
async def alternar_reacao_mensagem(
    canal_id: int,
    mensagem_id: int,
    payload: ChatReacaoCreate,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Clicar novamente no mesmo emoji remove a reação apenas deste usuário."""
    if payload.emoji not in CHAT_REACTION_EMOJIS:
        raise HTTPException(status_code=400, detail="Emoji de reação não permitido")

    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    # Serializa alterações de uma mesma mensagem, evitando conflito entre cliques
    # simultâneos e mantendo as contagens consistentes.
    result = await db.execute(
        select(ChatMensagem).where(
            ChatMensagem.id == mensagem_id, ChatMensagem.canal_id == canal_id
        ).with_for_update()
    )
    mensagem = result.scalar_one_or_none()
    if mensagem is None:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if mensagem.excluida_para_todos_em is not None:
        raise HTTPException(status_code=409, detail="Não é possível reagir a uma mensagem excluída")

    atual = await db.execute(
        select(ChatMensagemReacao).where(
            ChatMensagemReacao.mensagem_id == mensagem_id,
            ChatMensagemReacao.envoxer_id == envoxer.id,
            ChatMensagemReacao.emoji == payload.emoji,
        )
    )
    reacao = atual.scalar_one_or_none()
    ativa = reacao is None
    if reacao is None:
        db.add(ChatMensagemReacao(mensagem_id=mensagem_id, envoxer_id=envoxer.id, emoji=payload.emoji))
    else:
        await db.delete(reacao)
    await db.flush()
    agrupadas = await _carregar_reacoes(db, [mensagem], envoxer.id)
    contagens, _ = agrupadas.get(mensagem_id, ([], []))
    resposta = ChatReacaoToggleResponse(
        mensagem_id=mensagem_id, emoji=payload.emoji, ativa=ativa,
        alterado_por_id=envoxer.id, reacoes=contagens,
    )
    await _broadcast_evento_mensagem(db, canal, {
        "tipo": "mensagem_reacoes", "canal_id": canal_id,
        **resposta.model_dump(mode="json"),
    })
    return resposta


@router.patch("/canais/{canal_id}/mensagens/{mensagem_id}", response_model=ChatMensagemResponse)
async def editar_mensagem(
    canal_id: int,
    mensagem_id: int,
    payload: ChatMensagemEdit,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    mensagem = await db.get(ChatMensagem, mensagem_id)
    if mensagem is None or mensagem.canal_id != canal_id:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if mensagem.autor_envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Você só pode editar mensagens que enviou")
    if mensagem.excluida_para_todos_em is not None:
        raise HTTPException(status_code=409, detail="Mensagem já foi excluída para todos")
    if not _pode_editar_mensagem(mensagem, envoxer.id):
        raise HTTPException(status_code=409, detail="O prazo de 24 horas para editar esta mensagem encerrou")

    texto = (payload.texto or "").strip()
    if not texto:
        raise HTTPException(status_code=400, detail="A mensagem não pode ficar vazia")
    mensagem.texto = texto
    mensagem.editado_em = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(mensagem)

    citacoes = await _carregar_citacoes(db, [mensagem])
    reacoes = await _carregar_reacoes(db, [mensagem], envoxer.id)
    resposta = _mensagem_response(
        mensagem, envoxer.nome, envoxer.foto_url, envoxer.id,
        citacoes.get(mensagem.resposta_a_id), *reacoes.get(mensagem.id, ([], [])),
    )
    await _broadcast_evento_mensagem(db, canal, {
        "tipo": "mensagem_editada", "canal_id": canal_id,
        "mensagem": resposta.model_dump(mode="json"),
    })
    return resposta


@router.delete("/canais/{canal_id}/mensagens/{mensagem_id}", response_model=ChatMensagemResponse)
async def excluir_mensagem_para_todos(
    canal_id: int,
    mensagem_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    mensagem = await db.get(ChatMensagem, mensagem_id)
    if mensagem is None or mensagem.canal_id != canal_id:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if mensagem.autor_envoxer_id != envoxer.id:
        raise HTTPException(status_code=403, detail="Você só pode excluir mensagens que enviou")
    if mensagem.excluida_para_todos_em is not None:
        raise HTTPException(status_code=409, detail="Mensagem já foi excluída para todos")
    if not _pode_excluir_mensagem(mensagem, envoxer.id):
        raise HTTPException(status_code=409, detail="O prazo de 1 dia útil para excluir esta mensagem encerrou")

    mensagem.texto = None
    if mensagem.anexo_url:
        excluir_upload_url(mensagem.anexo_url)
    mensagem.anexo_url = None
    mensagem.anexo_nome = None
    mensagem.anexo_mime_type = None
    mensagem.anexo_tamanho_kb = None
    mensagem.excluida_para_todos_em = datetime.now(timezone.utc)
    await db.execute(delete(ChatMensagemReacao).where(ChatMensagemReacao.mensagem_id == mensagem.id))
    await db.flush()
    await db.refresh(mensagem)

    resposta = _mensagem_response(mensagem, envoxer.nome, envoxer.foto_url, envoxer.id)
    await _broadcast_evento_mensagem(db, canal, {
        "tipo": "mensagem_excluida", "canal_id": canal_id,
        "mensagem": resposta.model_dump(mode="json"),
    })
    return resposta


@router.get("/canais/{canal_id}/leituras", response_model=list[ChatLeituraResponse])
async def listar_leituras(
    canal_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Confirmações de leitura: autorizadas por canal e baseadas no histórico real."""
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)
    resultado = await db.execute(
        select(ChatLeitura.envoxer_id, Envoxer.nome, ChatLeitura.last_read_at)
        .join(Envoxer, Envoxer.id == ChatLeitura.envoxer_id)
        .where(ChatLeitura.canal_id == canal_id)
    )
    return [
        ChatLeituraResponse(envoxer_id=user_id, nome=nome, last_read_at=leu_ate)
        for user_id, nome, leu_ate in resultado.all()
    ]


@router.post("/canais/{canal_id}/ler", status_code=status.HTTP_204_NO_CONTENT)
async def marcar_lido(
    canal_id: int,
    envoxer: Annotated[Envoxer, Depends(get_current_envoxer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    ate_mensagem_id: Optional[int] = Query(None, gt=0),
):
    """Confirma leitura somente até mensagem realmente exibida pelo cliente.

    O endpoint sem parâmetro permanece compatível com clientes antigos; usa a
    última mensagem já persistida, nunca um instante posterior ao conteúdo.
    """
    canal = await db.get(ChatCanal, canal_id)
    if canal is None:
        raise HTTPException(status_code=404, detail="Canal não encontrado")
    _validar_acesso_dm(canal, envoxer)

    if ate_mensagem_id is None:
        result = await db.execute(
            select(ChatMensagem).where(ChatMensagem.canal_id == canal_id)
            .order_by(ChatMensagem.id.desc()).limit(1)
        )
        ultima = result.scalar_one_or_none()
    else:
        ultima = await db.get(ChatMensagem, ate_mensagem_id)
        if ultima is None or ultima.canal_id != canal_id:
            raise HTTPException(status_code=400, detail="Mensagem não pertence a esta conversa")
    if ultima is None:
        return

    # O cursor persistido no banco é monotônico: duas abas não conseguem
    # retroceder a leitura uma da outra, mesmo em chamadas concorrentes.
    novo_cursor = ultima.created_at
    existente = await db.execute(
        select(ChatLeitura.last_read_at).where(
            ChatLeitura.canal_id == canal_id, ChatLeitura.envoxer_id == envoxer.id
        )
    )
    atual = existente.scalar_one_or_none()
    if atual is not None and atual >= novo_cursor:
        return

    stmt = pg_insert(ChatLeitura).values(
        envoxer_id=envoxer.id, canal_id=canal_id, last_read_at=novo_cursor,
    )
    await db.execute(stmt.on_conflict_do_update(
        index_elements=[ChatLeitura.envoxer_id, ChatLeitura.canal_id],
        set_={"last_read_at": func.greatest(ChatLeitura.last_read_at, stmt.excluded.last_read_at)},
    ))
    await db.flush()
    result = await db.execute(
        select(ChatLeitura.last_read_at).where(
            ChatLeitura.canal_id == canal_id, ChatLeitura.envoxer_id == envoxer.id
        )
    )
    leitura_ate = result.scalar_one()
    # Também confirma o cursor antes de notificar os demais participantes.
    await db.commit()
    await _broadcast_evento_mensagem(db, canal, {
        "tipo": "chat_leitura_atualizada",
        "canal_id": canal_id,
        "envoxer_id": envoxer.id,
        "nome": envoxer.nome,
        "last_read_at": leitura_ate.isoformat(),
    })


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, token: str = Query(...)):
    payload = decode_access_token(token)
    if payload is None or payload.get("sub") is None:
        await websocket.close(code=4401)
        return
    if payload.get("tipo") not in (None, "envoxer"):
        await websocket.close(code=4401)
        return
    envoxer_id = int(payload["sub"])
    sid = payload.get("sid")

    async def valido():
        async with AsyncSessionLocal() as db:
            usuario = await db.get(Envoxer, envoxer_id)
            if usuario is None or not usuario.ativo:
                return False
            if sid:
                sessao = await db.get(SessaoWeb, sid)
                return valida_sessao(sessao) and sessao.envoxer_id == envoxer_id
            return True

    if not await valido():
        await websocket.close(code=4401)
        return
    await chat_ws_manager.conectar(envoxer_id, websocket)
    try:
        while True:
            try:
                texto = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                if not await valido():
                    await websocket.close(code=4401)
                    break
                continue
            if not await valido():
                await websocket.close(code=4401)
                break
            try:
                msg = json.loads(texto)
            except (json.JSONDecodeError, TypeError):
                continue
            if msg.get("tipo") == "visibilidade":
                await chat_ws_manager.marcar_visibilidade(envoxer_id, websocket, bool(msg.get("visivel")))
            elif msg.get("tipo") == "canal_em_foco":
                value = msg.get("canal_id")
                if value is None:
                    chat_ws_manager.registrar_canal_aberto(envoxer_id, websocket, None)
                elif isinstance(value, int) and value > 0:
                    chat_ws_manager.registrar_canal_aberto(envoxer_id, websocket, value)
    except WebSocketDisconnect:
        pass
    finally:
        await chat_ws_manager.desconectar(envoxer_id, websocket)

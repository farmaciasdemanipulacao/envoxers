from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChatMensagemCreate(BaseModel):
    texto: Optional[str] = None
    anexo_url: Optional[str] = None


class ChatMensagemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canal_id: int
    autor_envoxer_id: int
    autor_nome: str
    autor_foto: Optional[str] = None
    texto: Optional[str] = None
    anexo_url: Optional[str] = None
    created_at: datetime


class ChatCanalResponse(BaseModel):
    id: int
    tipo: str
    nome: str
    cliente_id: Optional[int] = None
    outro_envoxer_id: Optional[int] = None  # só em tipo=dm — o outro participante
    nao_lidas: int = 0
    ultima_mensagem: Optional[ChatMensagemResponse] = None

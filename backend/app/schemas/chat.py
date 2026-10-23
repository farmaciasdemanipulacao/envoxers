from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ChatMensagemCreate(BaseModel):
    texto: Optional[str] = None
    anexo_url: Optional[str] = None
    resposta_a_id: Optional[int] = None


class ChatMensagemEdit(BaseModel):
    texto: str


class ChatCitacaoResponse(BaseModel):
    id: int
    autor_nome: str
    texto: Optional[str] = None
    anexo_nome: Optional[str] = None
    excluida: bool = False


class ChatReacaoCreate(BaseModel):
    emoji: str


class ChatReacaoCount(BaseModel):
    emoji: str
    quantidade: int


class ChatReacaoToggleResponse(BaseModel):
    mensagem_id: int
    emoji: str
    ativa: bool
    alterado_por_id: int
    reacoes: list[ChatReacaoCount]


class ChatMensagemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    canal_id: int
    autor_envoxer_id: int
    autor_nome: str
    resposta_a_id: Optional[int] = None
    resposta_a: Optional[ChatCitacaoResponse] = None
    autor_foto: Optional[str] = None
    texto: Optional[str] = None
    anexo_url: Optional[str] = None
    anexo_nome: Optional[str] = None
    anexo_mime_type: Optional[str] = None
    anexo_tamanho_kb: Optional[int] = None
    created_at: datetime
    editado_em: Optional[datetime] = None
    excluida_para_todos_em: Optional[datetime] = None
    prazo_edicao: Optional[datetime] = None
    prazo_exclusao: Optional[datetime] = None
    pode_editar: bool = False
    pode_excluir: bool = False
    reacoes: list[ChatReacaoCount] = []
    minhas_reacoes: list[str] = []


class ChatCanalResponse(BaseModel):
    id: int
    tipo: str
    nome: str
    cliente_id: Optional[int] = None
    outro_envoxer_id: Optional[int] = None  # só em tipo=dm — o outro participante
    nao_lidas: int = 0
    ultima_mensagem: Optional[ChatMensagemResponse] = None


class ChatCanalPendenteItem(BaseModel):
    canal_id: int
    outro_envoxer_id: int
    outro_envoxer_nome: str
    outro_envoxer_foto: Optional[str] = None
    qtd_pendente: int


class ChatBloqueioResponse(BaseModel):
    bloqueado: bool
    canais: list[ChatCanalPendenteItem] = []

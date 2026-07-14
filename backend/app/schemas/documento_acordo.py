from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ItemAlteradoInput(BaseModel):
    item_escopo_id: int
    quantidade_nova: int


class DocumentoAcordoCreate(BaseModel):
    motivo: str
    itens: list[ItemAlteradoInput]
    envoxer_ids: list[int] = []
    cliente_contato_ids: list[int] = []


class ItemAlteradoResponse(BaseModel):
    item_escopo_id: int
    tipo: str
    descricao: Optional[str] = None
    quantidade_anterior: int
    quantidade_nova: int


class DocumentoConfirmacaoResponse(BaseModel):
    id: int
    tipo_confirmante: str
    envoxer_id: Optional[int] = None
    cliente_contato_id: Optional[int] = None
    nome_snapshot: str
    email_snapshot: str
    confirmado_em: Optional[datetime] = None
    ip: Optional[str] = None


class DocumentoAcordoResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nome: Optional[str] = None
    tipo: str
    motivo: str
    itens_alterados: list[ItemAlteradoResponse]
    status: str
    confirmacoes: list[DocumentoConfirmacaoResponse] = []
    criado_por_nome: Optional[str] = None
    vigente_em: Optional[datetime] = None
    cancelado_em: Optional[datetime] = None
    created_at: datetime

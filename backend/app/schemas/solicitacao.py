from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AnexoSolicitacaoItem(BaseModel):
    nome: str
    url: str
    mime_type: Optional[str] = None
    tamanho_kb: Optional[int] = None
    enviado_por_envoxer_id: Optional[int] = None
    criado_em: datetime


class SolicitacaoCreate(BaseModel):
    cliente_id: int
    tipo: str  # novo_post | alteracao | material_extra | campanha | evento
    titulo: str
    descricao: Optional[str] = None
    solicitante_nome: Optional[str] = None


class SolicitacaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    status: Optional[str] = None
    motivo_recusa: Optional[str] = None


class SolicitacaoResponse(BaseModel):
    id: int
    cliente_id: int
    tipo: str
    titulo: str
    descricao: Optional[str] = None
    anexos: list[AnexoSolicitacaoItem] = []
    status: str
    motivo_recusa: Optional[str] = None
    tarefa_id_gerada: Optional[int] = None
    solicitante_nome: Optional[str] = None
    atendido_por_envoxer_id: Optional[int] = None
    respondido_em: Optional[datetime] = None
    cliente_nome: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AlertaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Optional[str] = None  # reconhecido | resolvido | ignorado
    resolucao_nota: Optional[str] = None


class AlertaResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nome: Optional[str] = None
    farol_de: str
    farol_para: str
    motivo_json: dict
    motivo_texto: str
    sugestao_acao: Optional[str] = None
    status: str
    reconhecido_por_envoxer_id: Optional[int] = None
    reconhecido_por_nome: Optional[str] = None
    reconhecido_em: Optional[datetime] = None
    resolvido_em: Optional[datetime] = None
    resolucao_nota: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CheckInCreate(BaseModel):
    data_realizado: datetime
    tipo: str  # ligacao | reuniao | mensagem | email | presencial
    motivo: str = "rotina"  # rotina | checkpoint_retencao | alerta_farol | alteracao_escopo | outro
    humor: Optional[str] = None  # positivo | neutro | negativo | critico
    observacao: Optional[str] = None
    proximo_sugerido: Optional[date] = None


class CheckInResponse(BaseModel):
    id: int
    cliente_id: int
    data_realizado: datetime
    tipo: str
    motivo: str
    responsavel_envoxer_id: Optional[int] = None
    responsavel_nome: Optional[str] = None
    humor: Optional[str] = None
    observacao: Optional[str] = None
    proximo_sugerido: Optional[date] = None
    proximo_realizado: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

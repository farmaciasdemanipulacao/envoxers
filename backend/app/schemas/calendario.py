from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class EventoCreate(BaseModel):
    titulo: str
    tipo: str  # reuniao | captacao | evento_externo | live | outro
    cliente_id: Optional[int] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    dia_inteiro: bool = False
    local: Optional[str] = None
    descricao: Optional[str] = None


class EventoResponse(BaseModel):
    id: int
    titulo: str
    tipo: str
    cliente_id: Optional[int] = None
    data_inicio: datetime
    data_fim: Optional[datetime] = None
    dia_inteiro: bool
    local: Optional[str] = None
    descricao: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

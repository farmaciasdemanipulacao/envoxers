from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CicloAvaliacaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str
    nome: str
    data_inicio: date
    data_fim: date


class CicloAvaliacaoResponse(BaseModel):
    id: int
    tipo: str
    nome: str
    data_inicio: date
    data_fim: date
    status: str
    criado_por_id: Optional[int] = None
    aberto_em: Optional[datetime] = None
    encerrado_em: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CicloAvaliacaoResumo(CicloAvaliacaoResponse):
    total_participantes: int = 0
    total_respondidas: int = 0

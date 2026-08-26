from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class Feedback1a1Create(BaseModel):
    model_config = ConfigDict(extra="forbid")

    liderado_id: int
    # Só admin pode setar um gestor_id diferente do próprio — ver rota.
    gestor_id: Optional[int] = None
    data: date
    pauta: Optional[str] = None
    combinados: Optional[str] = None
    proximo_sugerido: Optional[date] = None


class Feedback1a1Update(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data: Optional[date] = None
    pauta: Optional[str] = None
    combinados: Optional[str] = None
    proximo_sugerido: Optional[date] = None


class Feedback1a1ComentarioLideradoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    comentario_liderado: str


class Feedback1a1Response(BaseModel):
    id: int
    gestor_id: int
    gestor_nome: Optional[str] = None
    liderado_id: int
    liderado_nome: Optional[str] = None
    data: date
    pauta: Optional[str] = None
    combinados: Optional[str] = None
    comentario_liderado: Optional[str] = None
    proximo_sugerido: Optional[date] = None
    criado_por_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True

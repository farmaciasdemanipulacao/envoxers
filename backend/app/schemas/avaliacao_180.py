from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class Avaliacao180Responder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nota_geral: Optional[int] = Field(default=None, ge=1, le=5)
    pontos_fortes: Optional[str] = None
    pontos_melhoria: Optional[str] = None
    comentario: Optional[str] = None


class Avaliacao180Response(BaseModel):
    id: int
    ciclo_id: int
    avaliador_id: int
    avaliador_nome: Optional[str] = None
    avaliado_id: int
    avaliado_nome: Optional[str] = None
    direcao: str
    nota_geral: Optional[int] = None
    pontos_fortes: Optional[str] = None
    pontos_melhoria: Optional[str] = None
    comentario: Optional[str] = None
    status: str
    enviada_em: Optional[datetime] = None

    class Config:
        from_attributes = True

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class CompetenciaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str
    descricao: Optional[str] = None
    ordem: int = 0


class CompetenciaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None
    ordem: Optional[int] = None


class CompetenciaResponse(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    ativo: bool
    ordem: int

    class Config:
        from_attributes = True


class Avaliacao360Responder(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # {competencia_id (str): nota 1-5}
    respostas: dict[str, int]
    comentario: Optional[str] = None


class Avaliacao360Response(BaseModel):
    id: int
    ciclo_id: int
    avaliador_id: int
    avaliador_nome: Optional[str] = None
    avaliado_id: int
    avaliado_nome: Optional[str] = None
    respostas: dict = {}
    comentario: Optional[str] = None
    status: str
    enviada_em: Optional[datetime] = None

    class Config:
        from_attributes = True


class Avaliacao360ResultadoItem(BaseModel):
    competencia_id: int
    competencia_nome: str
    media: Optional[float] = None
    quantidade_notas: int = 0


class Avaliacao360Resultado(BaseModel):
    avaliado_id: int
    avaliado_nome: str
    total_avaliacoes: int
    respondidas: int
    por_competencia: list[Avaliacao360ResultadoItem]
    comentarios: list[str] = []

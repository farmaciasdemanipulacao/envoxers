from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, ConfigDict


class PerguntaClimaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texto: str
    tipo: str = "likert"
    ordem: int = 0


class PerguntaClimaResponse(BaseModel):
    id: int
    ciclo_id: int
    texto: str
    tipo: str
    ordem: int

    class Config:
        from_attributes = True


class RespostaClimaEnviar(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # {pergunta_id (str): valor} — int 1-5 (likert) ou string (aberta)
    respostas: dict[str, Union[int, str]]


class RespostaClimaMinhaResponse(BaseModel):
    ciclo_id: int
    respondido: bool
    respostas: dict = {}
    enviada_em: Optional[datetime] = None


class ClimaResultadoPerguntaLikert(BaseModel):
    pergunta_id: int
    texto: str
    tipo: str = "likert"
    media: Optional[float] = None
    distribuicao: dict[str, int] = {}


class ClimaResultadoPerguntaAberta(BaseModel):
    pergunta_id: int
    texto: str
    tipo: str = "aberta"
    respostas: list[str] = []


class ClimaResultado(BaseModel):
    ciclo_id: int
    total_ativos: int
    total_respondentes: int
    perguntas: list[dict]


class ClimaRespostaBrutaResponse(BaseModel):
    envoxer_id: int
    envoxer_nome: str
    respostas: dict
    enviada_em: datetime

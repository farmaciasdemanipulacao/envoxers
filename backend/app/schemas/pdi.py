from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PdiAcaoComentarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    texto: str


class PdiAcaoComentarioResponse(BaseModel):
    id: int
    autor_id: Optional[int] = None
    autor_nome: Optional[str] = None
    autor_foto: Optional[str] = None
    texto: str
    criado_em: datetime

    class Config:
        from_attributes = True


class PdiAcaoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    envoxer_id: int
    titulo: str
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    prazo: Optional[date] = None
    # Preenchido só quando a ação nasce de um resultado de 360/180/1:1 — criação
    # manual (o caso comum) deixa os dois em branco.
    origem_tipo: Optional[str] = None
    origem_id: Optional[int] = None


class PdiAcaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = None
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    prazo: Optional[date] = None
    status: Optional[str] = None


class PdiAcaoResponse(BaseModel):
    id: int
    envoxer_id: int
    titulo: str
    descricao: Optional[str] = None
    categoria: Optional[str] = None
    prazo: Optional[date] = None
    status: str
    origem_tipo: Optional[str] = None
    origem_id: Optional[int] = None
    criado_por_id: Optional[int] = None
    criado_por_nome: Optional[str] = None
    concluida_em: Optional[datetime] = None
    created_at: datetime
    comentarios: list[PdiAcaoComentarioResponse] = []

    class Config:
        from_attributes = True


class PdiResumoEnvoxerResponse(BaseModel):
    envoxer_id: int
    nome: str
    foto_url: Optional[str] = None
    total: int
    planejadas: int
    em_andamento: int
    concluidas: int
    canceladas: int
    proximo_prazo: Optional[date] = None

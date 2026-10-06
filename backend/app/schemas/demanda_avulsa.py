from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

STATUS_AVULSA = {"nova", "em_andamento", "aguardando_terceiro", "concluida"}
PRIORIDADES_AVULSA = {"baixa", "media", "alta", "critica"}

class DemandaAvulsaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contexto: str = Field(min_length=2, max_length=160)
    titulo: str = Field(min_length=2, max_length=220)
    descricao: Optional[str] = Field(default=None, max_length=5000)
    responsavel_envoxer_id: Optional[int] = None
    prazo: Optional[date] = None
    prioridade: str = "media"

class DemandaAvulsaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contexto: Optional[str] = Field(default=None, min_length=2, max_length=160)
    titulo: Optional[str] = Field(default=None, min_length=2, max_length=220)
    descricao: Optional[str] = Field(default=None, max_length=5000)
    responsavel_envoxer_id: Optional[int] = None
    prazo: Optional[date] = None
    prioridade: Optional[str] = None
    status: Optional[str] = None

class DemandaAvulsaResponse(BaseModel):
    id: int
    contexto: str
    titulo: str
    descricao: Optional[str] = None
    responsavel_envoxer_id: Optional[int] = None
    responsavel_nome: Optional[str] = None
    responsavel_foto: Optional[str] = None
    criado_por_envoxer_id: Optional[int] = None
    criado_por_nome: Optional[str] = None
    prazo: Optional[date] = None
    prioridade: str
    status: str
    concluida_em: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

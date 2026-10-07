from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field

TipoFeedback = Literal["erro", "funcionalidade"]
StatusFeedback = Literal["novo", "em_analise", "feito", "descartado"]
PrioridadeFeedback = Literal["alta", "media", "baixa"]

class FeedbackSistemaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: TipoFeedback
    titulo: str = Field(min_length=3, max_length=180)
    descricao: str = Field(min_length=3, max_length=5000)
    pagina: Optional[str] = Field(default=None, max_length=500)
    prioridade: PrioridadeFeedback = "media"

class FeedbackSistemaUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: Optional[TipoFeedback] = None
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=180)
    descricao: Optional[str] = Field(default=None, min_length=3, max_length=5000)
    prioridade: Optional[PrioridadeFeedback] = None

class FeedbackSistemaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Optional[StatusFeedback] = None
    observacao_admin: Optional[str] = Field(default=None, max_length=5000)
    prioridade: Optional[PrioridadeFeedback] = None

class FeedbackSistemaResponse(BaseModel):
    id: int
    tipo: str
    titulo: str
    descricao: str
    pagina: Optional[str] = None
    screenshot_url: Optional[str] = None
    status: str
    prioridade: str
    criado_por_envoxer_id: Optional[int] = None
    criado_por_nome: str
    observacao_admin: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class FeedbackSistemaNovosCount(BaseModel):
    total: int

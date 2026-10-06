from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict, Field

TipoFeedback = Literal["erro", "funcionalidade"]
StatusFeedback = Literal["novo", "em_analise", "feito", "descartado"]

class FeedbackSistemaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    tipo: TipoFeedback
    titulo: str = Field(min_length=3, max_length=180)
    descricao: str = Field(min_length=3, max_length=5000)
    pagina: Optional[str] = Field(default=None, max_length=500)

class FeedbackSistemaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Optional[StatusFeedback] = None
    observacao_admin: Optional[str] = Field(default=None, max_length=5000)

class FeedbackSistemaResponse(BaseModel):
    id: int
    tipo: str
    titulo: str
    descricao: str
    pagina: Optional[str] = None
    status: str
    criado_por_envoxer_id: Optional[int] = None
    criado_por_nome: str
    observacao_admin: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class FeedbackSistemaNovosCount(BaseModel):
    total: int

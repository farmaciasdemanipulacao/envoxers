from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FocoIniciarRequest(BaseModel):
    tarefa_id: int


class FocoFinalizarRequest(BaseModel):
    comentario: Optional[str] = None


class RegistroFocoResponse(BaseModel):
    id: int
    tarefa_id: int
    tarefa_titulo: Optional[str] = None
    tarefa_status: Optional[str] = None
    cliente_nome: Optional[str] = None
    inicio: datetime
    fim: Optional[datetime] = None
    duracao_min: Optional[int] = None
    custo: Optional[float] = None
    pausado_em: Optional[datetime] = None
    duracao_pausada_min: int = 0
    comentario: Optional[str] = None

    class Config:
        from_attributes = True


class FocoResumoResponse(BaseModel):
    hoje_min: int
    hoje_custo: float
    hoje_sessoes: int
    semana_min: int
    semana_meta_min: int

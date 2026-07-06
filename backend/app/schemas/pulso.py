from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PulsoCreate(BaseModel):
    ano_mes: str  # 'YYYY-MM'
    nota: int
    comentario: Optional[str] = None
    metodo: str = "ligacao"  # ligacao | pesquisa | estimativa_interna | conversa_avulsa
    respondente_cliente_nome: Optional[str] = None


class PulsoResponse(BaseModel):
    id: int
    cliente_id: int
    ano_mes: str
    nota: int
    comentario: Optional[str] = None
    metodo: str
    respondente_cliente_nome: Optional[str] = None
    registrado_por_envoxer_id: Optional[int] = None
    registrado_por_envoxer_nome: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

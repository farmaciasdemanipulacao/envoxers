from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PendenciaResponse(BaseModel):
    id: int
    tarefa_id: int
    etapa_id: Optional[int] = None
    tarefa_titulo: Optional[str] = None
    mensagem: str
    lida: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

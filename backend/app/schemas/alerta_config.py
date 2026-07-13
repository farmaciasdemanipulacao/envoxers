from typing import Optional

from pydantic import BaseModel, ConfigDict


class AlertaConfigResponse(BaseModel):
    id: int
    chave: str
    nome: str
    grupo: str
    descricao: Optional[str] = None
    ativo: bool
    papeis: Optional[list[str]] = None

    model_config = ConfigDict(from_attributes=True)


class AlertaConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ativo: Optional[bool] = None
    papeis: Optional[list[str]] = None

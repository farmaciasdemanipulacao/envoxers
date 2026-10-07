from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

NivelBase = Literal["admin", "gestor", "envoxer", "comercial"]

class PerfilAcessoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str = Field(min_length=2, max_length=100)
    nivel_base: NivelBase
    modulos: list[str]

class PerfilAcessoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    nome: str | None = Field(default=None, min_length=2, max_length=100)
    nivel_base: NivelBase | None = None
    modulos: list[str] | None = None
    ativo: bool | None = None

class PerfilAcessoResponse(BaseModel):
    id: int
    nome: str
    slug: str
    nivel_base: str
    modulos: list[str]
    sistema: bool
    ativo: bool
    usuarios_count: int = 0
    created_at: datetime
    updated_at: datetime

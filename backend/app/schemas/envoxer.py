from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EnvoxerBase(BaseModel):
    nome: str
    email: EmailStr
    cargo: str
    permissao: str = "envoxer"
    foto_url: Optional[str] = None
    ativo: bool = True


class EnvoxerCreate(EnvoxerBase):
    # custo_hora não é aceito no payload — é calculado pela API a partir destes dois campos.
    model_config = ConfigDict(extra="forbid")

    senha: str
    salario_mensal: float = Field(gt=0)
    horas_mes: int = Field(default=220, gt=0)


class EnvoxerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    cargo: Optional[str] = None
    salario_mensal: Optional[float] = Field(default=None, gt=0)
    horas_mes: Optional[int] = Field(default=None, gt=0)
    permissao: Optional[str] = None
    foto_url: Optional[str] = None
    ativo: Optional[bool] = None
    senha: Optional[str] = None


class EnvoxerResponse(EnvoxerBase):
    id: int
    pontos: int
    salario_mensal: Optional[float] = None
    horas_mes: int
    custo_hora: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

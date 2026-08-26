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
    gestor_responsavel_id: Optional[int] = None


class EnvoxerCreate(EnvoxerBase):
    # custo_hora não é aceito no payload — é calculado pela API a partir destes dois campos.
    model_config = ConfigDict(extra="forbid")

    senha: str
    salario_mensal: float = Field(gt=0)
    horas_mes: int = Field(default=220, gt=0)


class EnvoxerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Sem `ativo` de propósito — ativar/desativar só passa por POST /{id}/ativar e
    # /{id}/desativar (essa exige substituto pra transferir pendências, ver
    # services/transferencia_envoxer.py), nunca por este PATCH genérico.
    nome: Optional[str] = None
    email: Optional[EmailStr] = None
    cargo: Optional[str] = None
    salario_mensal: Optional[float] = Field(default=None, gt=0)
    horas_mes: Optional[int] = Field(default=None, gt=0)
    permissao: Optional[str] = None
    foto_url: Optional[str] = None
    senha: Optional[str] = None
    gestor_responsavel_id: Optional[int] = None


class EnvoxerDesativarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    substituto_id: int


class TransferenciaResumo(BaseModel):
    substituto_nome: str
    etapas_migradas: int
    etapas_template_migradas: int
    prioridades_migradas: int
    foco_finalizado: bool


class EnvoxerResponse(EnvoxerBase):
    id: int
    pontos: int
    salario_mensal: Optional[float] = None
    horas_mes: int
    # Optional (não `float`) pra permitir redigir() pra não-admin, ver app/core/valores.py (D-090).
    custo_hora: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

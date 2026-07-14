from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class ClienteContatoCreate(BaseModel):
    nome: str
    cargo: Optional[str] = None
    email: EmailStr


class ClienteContatoUpdate(BaseModel):
    nome: Optional[str] = None
    cargo: Optional[str] = None
    email: Optional[EmailStr] = None
    ativo: Optional[bool] = None


class ClienteContatoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    nome: str
    cargo: Optional[str] = None
    email: str
    ativo: bool
    senha_definida: bool
    created_at: datetime


class ClienteContatoComLink(ClienteContatoResponse):
    link_definicao_senha: str


class PortalSetSenhaRequest(BaseModel):
    token: str
    senha: str


class PortalLoginRequest(BaseModel):
    email: EmailStr
    senha: str


class PortalContatoMe(BaseModel):
    id: int
    nome: str
    email: str
    cargo: Optional[str] = None
    cliente_id: int
    cliente_nome: str

    class Config:
        from_attributes = True


class PortalToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: int
    nome: str
    cliente_id: int
    cliente_nome: str

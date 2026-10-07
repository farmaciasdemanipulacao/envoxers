from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: int
    nome: str
    permissao: str
    foto_url: Optional[str] = None


class EnvoxerMe(BaseModel):
    id: int
    nome: str
    email: str
    cargo: str
    permissao: str
    foto_url: Optional[str] = None
    perfil_acesso_id: Optional[int] = None
    perfil_acesso_nome: Optional[str] = None
    modulos: list[str] = Field(default_factory=list)

    class Config:
        from_attributes = True

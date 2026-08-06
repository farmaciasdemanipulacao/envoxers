from typing import Optional

from pydantic import BaseModel, EmailStr


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

    class Config:
        from_attributes = True

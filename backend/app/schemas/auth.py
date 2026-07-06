from pydantic import BaseModel, EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    senha: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    nome: str
    permissao: str


class EnvoxerMe(BaseModel):
    id: int
    nome: str
    email: str
    cargo: str
    permissao: str

    class Config:
        from_attributes = True

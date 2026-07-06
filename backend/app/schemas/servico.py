from typing import Optional

from pydantic import BaseModel


class ServicoBase(BaseModel):
    nome: str
    slug: str
    descricao: Optional[str] = None
    ativo: bool = True


class ServicoCreate(ServicoBase):
    pass


class ServicoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    ativo: Optional[bool] = None


class ServicoResponse(ServicoBase):
    id: int

    class Config:
        from_attributes = True

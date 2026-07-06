from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.perfil import PerfilClienteResponse


class ClienteServicoItem(BaseModel):
    servico_id: int
    valor_mensal: float = 0
    observacao: Optional[str] = None


class EscopoItem(BaseModel):
    posts_mes: int = 0
    videos_mes: int = 0
    campanhas_mes: int = 0
    limite_alteracoes: int = 2
    outros_itens: Optional[str] = None


class ClienteBase(BaseModel):
    nome: str
    logo_url: Optional[str] = None
    valor_contrato: float = 0
    tipo_receita: str = "recorrente"
    data_inicio_contrato: Optional[date] = None
    segmento: Optional[str] = None
    canal_aquisicao: Optional[str] = None
    ticket: Optional[float] = None
    maturidade_digital: Optional[str] = None
    responsavel_envoxer_id: Optional[int] = None
    links_redes: Optional[dict] = None
    observacoes: Optional[str] = None
    ativo: bool = True


class ClienteCreate(ClienteBase):
    servicos: list[ClienteServicoItem] = []
    escopo: Optional[EscopoItem] = None


class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    logo_url: Optional[str] = None
    valor_contrato: Optional[float] = None
    tipo_receita: Optional[str] = None
    data_inicio_contrato: Optional[date] = None
    segmento: Optional[str] = None
    canal_aquisicao: Optional[str] = None
    ticket: Optional[float] = None
    maturidade_digital: Optional[str] = None
    responsavel_envoxer_id: Optional[int] = None
    links_redes: Optional[dict] = None
    observacoes: Optional[str] = None
    ativo: Optional[bool] = None
    servicos: Optional[list[ClienteServicoItem]] = None
    escopo: Optional[EscopoItem] = None


class ClienteResponse(ClienteBase):
    id: int
    status_farol: str
    created_at: datetime
    updated_at: datetime
    perfil: Optional[PerfilClienteResponse] = None

    class Config:
        from_attributes = True


class ClienteListItem(BaseModel):
    """Equivalente a vw_cliente_lista — calculado no endpoint, sem VIEW no banco."""
    id: int
    nome: str
    logo_url: Optional[str] = None
    status_farol: str
    tipo_receita: str
    segmento: Optional[str] = None
    data_inicio_contrato: Optional[date] = None
    valor_contrato: float
    valor_servicos_soma: float
    meses_de_casa: Optional[int] = None
    responsavel_nome: Optional[str] = None
    responsavel_foto: Optional[str] = None
    ativo: bool

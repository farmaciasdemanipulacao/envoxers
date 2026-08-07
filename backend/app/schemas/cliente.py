from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

from app.schemas.perfil import PerfilClienteResponse
from app.schemas.churn import ChurnSnapshotResponse


class ClienteServicoItem(BaseModel):
    servico_id: int
    # Optional (não só `float = 0`) pra permitir redigir com None na resposta pra
    # não-admin (ver app/core/valores.py, D-090) sem quebrar validação do response_model.
    valor_mensal: Optional[float] = 0
    observacao: Optional[str] = None


class EscopoItem(BaseModel):
    """Só o limite de alterações por peça — as quantidades contratadas (posts,
    vídeos, etc.) viraram `ItemEscopo` (ver item_escopo.py), com tela própria."""
    limite_alteracoes: int = 2


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
    data_cancelamento: Optional[date] = None
    created_at: datetime
    updated_at: datetime
    perfil: Optional[PerfilClienteResponse] = None
    churn: Optional[ChurnSnapshotResponse] = None
    servicos: list[ClienteServicoItem] = []
    limite_alteracoes: int = 2
    # Sobrescreve o tipo de ClienteBase (que exige float, sem default None) pra
    # permitir redigir(response, ["valor_contrato", "ticket"], envoxer) pra não-admin.
    # (`ticket` já é Optional em ClienteBase, não precisa sobrescrever.)
    valor_contrato: Optional[float] = None

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
    # Optional pra permitir redigir() pra não-admin (D-090) — resto do payload continua igual.
    valor_contrato: Optional[float] = None
    valor_servicos_soma: Optional[float] = None
    meses_de_casa: Optional[int] = None
    responsavel_envoxer_id: Optional[int] = None
    responsavel_nome: Optional[str] = None
    responsavel_foto: Optional[str] = None
    ativo: bool

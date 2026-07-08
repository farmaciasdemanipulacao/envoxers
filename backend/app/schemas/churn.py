from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class MotivoChurnResponse(BaseModel):
    codigo: str
    nome: str
    categoria: str
    ordem: int

    model_config = ConfigDict(from_attributes=True)


class ClienteCancelarRequest(BaseModel):
    motivo_codigo: str
    motivo_detalhe: Optional[str] = None
    data_cancelamento: Optional[date] = None


class ChurnSnapshotResponse(BaseModel):
    motivo_codigo: str
    motivo_nome: Optional[str] = None
    motivo_detalhe: Optional[str] = None
    data_cancelamento: date
    meses_de_casa: int
    segmento_snap: Optional[str] = None
    ticket_snap: Optional[float] = None
    canal_aquisicao_snap: Optional[str] = None
    maturidade_snap: Optional[str] = None
    perfil_snap: Optional[str] = None
    valor_contrato_snap: float
    tipo_receita_snap: str
    margem_media_snap: Optional[float] = None
    pulso_medio_snap: Optional[float] = None
    farol_ultimo_snap: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChurnListaItemResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nome_snap: str
    motivo_codigo: str
    motivo_nome: Optional[str] = None
    motivo_detalhe: Optional[str] = None
    data_cancelamento: date
    meses_de_casa: int
    segmento_snap: Optional[str] = None
    ticket_snap: Optional[float] = None
    canal_aquisicao_snap: Optional[str] = None
    maturidade_snap: Optional[str] = None
    perfil_snap: Optional[str] = None
    valor_contrato_snap: float
    tipo_receita_snap: str
    margem_media_snap: Optional[float] = None
    pulso_medio_snap: Optional[float] = None
    farol_ultimo_snap: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

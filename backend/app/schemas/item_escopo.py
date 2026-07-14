from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ItemEscopoCreate(BaseModel):
    tipo: str
    descricao: Optional[str] = None
    cadencia: str = "mensal"
    quantidade: int = 0


class ItemEscopoUpdate(BaseModel):
    tipo: Optional[str] = None
    descricao: Optional[str] = None
    cadencia: Optional[str] = None
    quantidade: Optional[int] = None
    motivo: Optional[str] = None  # obrigatório se quantidade mudar — vira ItemEscopoHistorico
    ativo: Optional[bool] = None


class ItemEscopoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    cliente_id: int
    tipo: str
    descricao: Optional[str] = None
    cadencia: str
    quantidade: int
    ativo: bool
    created_at: datetime


class ItemEscopoHistoricoResponse(BaseModel):
    id: int
    quantidade_anterior: int
    quantidade_nova: int
    motivo: Optional[str] = None
    alterado_por_envoxer_nome: Optional[str] = None
    created_at: datetime


class EntregaManualCreate(BaseModel):
    ano_mes: str
    quantidade: int
    observacao: Optional[str] = None


class EntregaManualResponse(BaseModel):
    id: int
    ano_mes: str
    quantidade: int
    observacao: Optional[str] = None
    lancado_por_nome: Optional[str] = None
    created_at: datetime


class ReconciliacaoItemResponse(BaseModel):
    item_escopo_id: int
    tipo: str
    descricao: Optional[str] = None
    cadencia: str
    quantidade_contratada: int
    quantidade_entregue: int
    status: str  # completo | parcial | nao_entregue | excedente | em_andamento
    qtd_tarefas: int
    entregas_manuais: list[EntregaManualResponse] = []


class ReconciliacaoMesResponse(BaseModel):
    ano_mes: str
    fechado: bool
    itens: list[ReconciliacaoItemResponse]


class PainelEntregaveisItem(BaseModel):
    cliente_id: int
    cliente_nome: str
    ano_mes: str
    total_itens: int
    itens_com_gap: int
    pior_status: str


class AlertaEntregaResponse(BaseModel):
    id: int
    cliente_id: int
    cliente_nome: Optional[str] = None
    item_escopo_id: int
    item_tipo: Optional[str] = None
    item_descricao: Optional[str] = None
    ano_mes: str
    quantidade_contratada: int
    quantidade_entregue: int
    motivo_texto: str
    status: str
    reconhecido_por_nome: Optional[str] = None
    reconhecido_em: Optional[datetime] = None
    resolvido_em: Optional[datetime] = None
    resolucao_nota: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AlertaEntregaUpdate(BaseModel):
    status: Optional[str] = None
    resolucao_nota: Optional[str] = None

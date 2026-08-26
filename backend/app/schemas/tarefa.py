from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ComentarioItem(BaseModel):
    envoxer_id: int
    envoxer_nome: str
    texto: str
    mencoes: list[int] = []
    criado_em: datetime


class AnexoItem(BaseModel):
    nome: str
    url: str
    mime_type: Optional[str] = None
    tamanho_kb: Optional[int] = None
    enviado_por_envoxer_id: Optional[int] = None
    criado_em: datetime


class TarefaBase(BaseModel):
    cliente_id: int
    servico_id: Optional[int] = None
    item_escopo_id: Optional[int] = None
    titulo: str
    responsavel_envoxer_id: Optional[int] = None
    status: str = "nova"
    prazo: Optional[date] = None
    etiqueta: Optional[str] = None
    etiqueta_cor: Optional[str] = None


class TarefaCreate(TarefaBase):
    pass


class TarefaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cliente_id: Optional[int] = None
    servico_id: Optional[int] = None
    item_escopo_id: Optional[int] = None
    titulo: Optional[str] = None
    responsavel_envoxer_id: Optional[int] = None
    status: Optional[str] = None
    ordem: Optional[int] = None
    prazo: Optional[date] = None
    etiqueta: Optional[str] = None
    etiqueta_cor: Optional[str] = None


class ComentarioCreate(BaseModel):
    texto: str
    mencoes: list[int] = []


class TarefaResponse(TarefaBase):
    id: int
    ordem: int
    comentarios: list[ComentarioItem] = []
    anexos: list[AnexoItem] = []
    cliente_nome: Optional[str] = None
    cliente_farol: Optional[str] = None
    servico_nome: Optional[str] = None
    responsavel_nome: Optional[str] = None
    responsavel_foto: Optional[str] = None
    atrasada: bool = False
    qtd_comentarios: int = 0
    qtd_anexos: int = 0
    qtd_alteracoes: int = 0
    aprovada_interna: bool = False
    aprovada_cliente: bool = False
    proxima_etapa_titulo: Optional[str] = None
    proxima_etapa_responsavel_id: Optional[int] = None
    proxima_etapa_responsavel_nome: Optional[str] = None
    proxima_etapa_responsavel_foto: Optional[str] = None
    proxima_etapa_prazo: Optional[date] = None
    etapas_responsaveis_ids: list[int] = []
    finalizada_em: Optional[datetime] = None
    ano_mes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PrioridadeDiaReordenar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str  # "card" | "etapa"
    envoxer_id: int
    ids_em_ordem: list[int]


class EntregaCheckResponse(BaseModel):
    id: int
    numero: int
    entregue: bool
    entregue_em: Optional[datetime] = None
    entregue_por_nome: Optional[str] = None
    excedente: bool = False

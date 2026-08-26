from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class PortalSolicitacaoCreate(BaseModel):
    tipo: str
    titulo: str = Field(min_length=3, max_length=200)
    descricao: Optional[str] = Field(default=None, max_length=5000)


class PortalSolicitacaoOut(BaseModel):
    id: int
    tipo: str
    titulo: str
    descricao: Optional[str] = None
    status: str
    motivo_recusa: Optional[str] = None
    tarefa_id_gerada: Optional[int] = None
    solicitante_nome: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PortalComentarioCreate(BaseModel):
    texto: str = Field(min_length=1, max_length=4000)


class PortalAjusteCreate(BaseModel):
    tipo: str = Field(default="outro", max_length=40)
    descricao: str = Field(min_length=3, max_length=4000)


class PortalTarefaOut(BaseModel):
    id: int
    titulo: str
    status: str
    prazo: Optional[date] = None
    etiqueta: Optional[str] = None
    etiqueta_cor: Optional[str] = None
    ano_mes: Optional[str] = None
    cadencia: Optional[str] = None
    item_tipo: Optional[str] = None
    item_descricao: Optional[str] = None
    quantidade_contratada: Optional[int] = None
    quantidade_entregue: int = 0
    campanha_id: Optional[int] = None
    campanha_nome: Optional[str] = None
    comentarios: list = []
    anexos: list = []
    qtd_alteracoes: int = 0
    aprovada_cliente: bool = False
    created_at: datetime
    updated_at: datetime


class PortalCampanhaOut(BaseModel):
    id: int
    nome: str
    descricao: Optional[str] = None
    status: str
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    total: int
    em_andamento: int
    aprovacao: int
    finalizados: int
    progresso: int


class PortalBibliotecaItem(BaseModel):
    tarefa_id: int
    titulo: str
    campanha: Optional[str] = None
    finalizada_em: Optional[datetime] = None
    anexos: list = []


class PortalDashboardOut(BaseModel):
    solicitacoes_abertas: int
    em_andamento: int
    aprovacoes_pendentes: int
    finalizados: int
    solicitacoes_recentes: list[PortalSolicitacaoOut] = []
    tarefas_recentes: list[PortalTarefaOut] = []

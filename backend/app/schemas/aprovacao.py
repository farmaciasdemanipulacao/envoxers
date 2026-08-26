from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AprovacaoDecisaoCreate(BaseModel):
    etapa: str  # interna | cliente
    decisao: str  # aprovada | pediu_ajuste
    comentario: Optional[str] = None
    # Nome de quem decidiu do lado do cliente — só faz sentido quando etapa=cliente.
    decidido_por_cliente_nome: Optional[str] = None
    # Obrigatório quando decisao=pediu_ajuste — 1 Etapa "Ajustar" é criada por
    # responsável (ver app/api/routes/aprovacoes.py::_criar_etapas_ajuste).
    responsaveis_ajuste: list[int] = []


class AprovacaoResponse(BaseModel):
    id: int
    tarefa_id: int
    etapa: str
    decisao: str
    decidido_por_envoxer_id: Optional[int] = None
    decidido_por_cliente_nome: Optional[str] = None
    comentario: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AlteracaoCreate(BaseModel):
    descricao: str
    solicitante_cliente_nome: Optional[str] = None
    # Obrigatório — mesmo esquema de _criar_etapas_ajuste da aprovação interna.
    responsaveis_ajuste: list[int] = []


class AlteracaoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Optional[str] = None
    atendida_por_envoxer_id: Optional[int] = None


class AlteracaoResponse(BaseModel):
    id: int
    tarefa_id: int
    numero: int
    descricao: str
    solicitante_cliente_nome: Optional[str] = None
    status: str
    atendida_por_envoxer_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AutomacaoEtapaUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acao: str  # LIBERAR_PROXIMA_ETAPA | MOVER_TAREFA_COLUNA | MARCAR_TAREFA_CONCLUIDA | CRIAR_ALERTA_RESPONSAVEL
    coluna_destino: Optional[str] = None  # obrigatório quando acao == MOVER_TAREFA_COLUNA
    ativo: bool = True


class AutomacaoEtapaResponse(BaseModel):
    id: int
    etapa_id: int
    acao: str
    coluna_destino: Optional[str] = None
    ativo: bool

    model_config = ConfigDict(from_attributes=True)


class EtapaCreate(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    responsavel_id: Optional[int] = None
    prazo: Optional[date] = None


class EtapaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = None
    descricao: Optional[str] = None
    responsavel_id: Optional[int] = None
    prazo: Optional[date] = None
    ordem: Optional[int] = None


class EtapaResponse(BaseModel):
    id: int
    tarefa_id: int
    titulo: str
    descricao: Optional[str] = None
    responsavel_id: Optional[int] = None
    responsavel_nome: Optional[str] = None
    prazo: Optional[date] = None
    ordem: int
    status: str
    concluida_em: Optional[datetime] = None
    automacao: Optional[AutomacaoEtapaResponse] = None
    # Calculado: true quando a etapa anterior (por ordem) tem AutomacaoEtapa
    # LIBERAR_PROXIMA_ETAPA ativa e ainda não foi concluída.
    bloqueada: bool = False

    model_config = ConfigDict(from_attributes=True)

from typing import Optional

from pydantic import BaseModel, ConfigDict


class AutomacaoEtapaTemplateUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    acao: str  # LIBERAR_PROXIMA_ETAPA | MOVER_TAREFA_COLUNA | MARCAR_TAREFA_CONCLUIDA | CRIAR_ALERTA_RESPONSAVEL
    coluna_destino: Optional[str] = None  # obrigatório quando acao == MOVER_TAREFA_COLUNA
    ativo: bool = True


class AutomacaoEtapaTemplateResponse(BaseModel):
    id: int
    etapa_template_id: int
    acao: str
    coluna_destino: Optional[str] = None
    ativo: bool

    model_config = ConfigDict(from_attributes=True)


class EtapaTemplateCreate(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    prazo_dias: Optional[int] = None


class EtapaTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: Optional[str] = None
    descricao: Optional[str] = None
    prazo_dias: Optional[int] = None
    ordem: Optional[int] = None


class EtapaTemplateResponse(BaseModel):
    id: int
    servico_id: int
    titulo: str
    descricao: Optional[str] = None
    prazo_dias: Optional[int] = None
    ordem: int
    automacao: Optional[AutomacaoEtapaTemplateResponse] = None

    model_config = ConfigDict(from_attributes=True)

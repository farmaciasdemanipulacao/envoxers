from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

class FocoAjusteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    registro_foco_id: Optional[int] = None
    tarefa_id: Optional[int] = None
    comercial_task_id: Optional[int] = None
    demanda_avulsa_id: Optional[int] = None
    inicio_solicitado: datetime
    fim_solicitado: datetime
    motivo: str = Field(min_length=3, max_length=3000)

class FocoAjusteDecisao(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisao: str
    observacao_gestor: Optional[str] = Field(default=None, max_length=3000)

class FocoAjusteResponse(BaseModel):
    id: int
    envoxer_id: int
    envoxer_nome: Optional[str] = None
    registro_foco_id: Optional[int] = None
    tarefa_id: Optional[int] = None
    comercial_task_id: Optional[int] = None
    demanda_avulsa_id: Optional[int] = None
    contexto_label: Optional[str] = None
    inicio_solicitado: datetime
    fim_solicitado: datetime
    motivo: str
    status: str
    era_ativo: bool
    decidido_por_envoxer_id: Optional[int] = None
    decidido_por_nome: Optional[str] = None
    decidido_em: Optional[datetime] = None
    observacao_gestor: Optional[str] = None
    created_at: datetime

class FocoOpcao(BaseModel):
    tipo: str
    id: int
    label: str
    contexto: Optional[str] = None

class FocoRegistroRecente(BaseModel):
    id: int
    label: str
    inicio: datetime
    fim: Optional[datetime] = None
    ativo: bool
    descartado: bool

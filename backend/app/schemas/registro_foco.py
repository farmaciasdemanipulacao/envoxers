from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class FocoIniciarRequest(BaseModel):
    tarefa_id: int


class FocoFinalizarRequest(BaseModel):
    comentario: Optional[str] = None


class RegistroFocoResponse(BaseModel):
    id: int
    tarefa_id: int
    tarefa_titulo: Optional[str] = None
    tarefa_status: Optional[str] = None
    cliente_nome: Optional[str] = None
    inicio: datetime
    fim: Optional[datetime] = None
    duracao_min: Optional[int] = None
    custo: Optional[float] = None
    pausado_em: Optional[datetime] = None
    duracao_pausada_min: int = 0
    comentario: Optional[str] = None
    descartado: bool = False

    class Config:
        from_attributes = True


class FocoResumoResponse(BaseModel):
    hoje_min: int
    # Optional (não `float`) pra permitir redigir() pra não-admin, ver app/core/valores.py (D-090).
    hoje_custo: Optional[float] = None
    hoje_sessoes: int
    semana_min: int
    semana_meta_min: int


class FocoAtivoItem(BaseModel):
    """1 card de quem está com o Foco ligado agora, na tela 'Quem está em Foco' (D-090)."""
    envoxer_id: int
    envoxer_nome: str
    envoxer_foto: Optional[str] = None
    tarefa_id: int
    tarefa_titulo: Optional[str] = None
    cliente_nome: Optional[str] = None
    inicio: datetime
    pausado_em: Optional[datetime] = None


class FocoOfflineItem(BaseModel):
    """1 linha de quem NÃO está com o Foco ligado, com o último registro (ajuste
    pós-D-090, a pedido do Gus) — `ultimo_*` vem null se a pessoa nunca usou o Foco."""
    envoxer_id: int
    envoxer_nome: str
    envoxer_foto: Optional[str] = None
    ultimo_tarefa_titulo: Optional[str] = None
    ultimo_cliente_nome: Optional[str] = None
    ultimo_inicio: Optional[datetime] = None
    ultimo_fim: Optional[datetime] = None


class FocoStatusTimeResponse(BaseModel):
    ativos: list[FocoAtivoItem]
    offline: list[FocoOfflineItem]

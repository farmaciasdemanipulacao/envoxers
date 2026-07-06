from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class PerfilClienteResponse(BaseModel):
    perfil: str  # facil | neutro | dificil
    score: int
    velocidade_aprovacao_dias: Optional[float] = None
    alteracoes_media_por_tarefa: Optional[float] = None
    atrasos_causados_pelo_cliente: int
    tarefas_avaliadas: int
    calculado_em: datetime

    model_config = ConfigDict(from_attributes=True)

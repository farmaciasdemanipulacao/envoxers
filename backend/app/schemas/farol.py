from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class FarolClienteResponse(BaseModel):
    cliente_id: int
    cliente_nome: str
    responsavel_nome: Optional[str] = None
    farol: str  # verde | amarelo | vermelho
    health_score: int
    # {nome_sinal: {cor: str, valor: str|int|float|None}} — 8 chaves fixas (ver services/farol.py::LABELS)
    sinais: dict
    sinais_vermelhos: list[str]
    sinais_amarelos: list[str]
    motivo_texto: str
    sugestao_acao: Optional[str] = None
    calculado_em: datetime

    model_config = ConfigDict(from_attributes=True)

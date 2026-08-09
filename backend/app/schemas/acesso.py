from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AcessoLogResponse(BaseModel):
    id: int
    envoxer_id: Optional[int] = None
    envoxer_nome: Optional[str] = None
    envoxer_foto: Optional[str] = None
    criado_em: datetime
    ip: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True


class StatusDispositivoResponse(BaseModel):
    envoxer_id: int
    nome: str
    foto_url: Optional[str] = None
    permissao: str
    ativo: bool
    app_instalado: bool
    app_instalado_em: Optional[datetime] = None
    notificacoes_ativas: bool
    qtd_dispositivos: int
    ultimo_acesso: Optional[datetime] = None

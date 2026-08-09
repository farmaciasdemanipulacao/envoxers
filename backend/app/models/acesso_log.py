"""Model: AcessoLog — histórico de acessos (login bem-sucedido) de um Envoxer,
independente do timer de Foco. Acesso = estar logado no app (grava 1 linha por
login em app/api/routes/auth.py::login), mesmo padrão do ImpersonacaoLog."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AcessoLog(Base):
    __tablename__ = "acesso_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

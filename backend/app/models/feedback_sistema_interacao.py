"""Histórico/auditoria do ciclo de teste de Erros e Sugestões."""
from typing import Optional

from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class FeedbackSistemaInteracao(Base, TimestampMixin):
    __tablename__ = "feedback_sistema_interacao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    feedback_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("feedback_sistema.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    autor_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    autor_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    screenshot_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

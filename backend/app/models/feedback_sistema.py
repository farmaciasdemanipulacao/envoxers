"""Feedback do sistema: erros e sugestões enviados por usuários internos."""
from typing import Optional
from sqlalchemy import BigInteger, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class FeedbackSistema(Base, TimestampMixin):
    __tablename__ = "feedback_sistema"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    titulo: Mapped[str] = mapped_column(String(180), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    pagina: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="novo")
    criado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    criado_por_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    observacao_admin: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

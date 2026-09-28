"""Model: ChatMensagem — mensagem enviada num ChatCanal, com edição/exclusão temporizadas."""
from typing import Optional
from datetime import datetime

from sqlalchemy import BigInteger, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ChatMensagem(Base, TimestampMixin):
    __tablename__ = "chat_mensagem"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    canal_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chat_canal.id", ondelete="CASCADE"), nullable=False)
    autor_envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    texto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anexo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    editado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    excluida_para_todos_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

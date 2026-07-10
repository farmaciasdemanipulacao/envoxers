"""Model: ChatMensagem — mensagem enviada num ChatCanal. Sem edição/exclusão nesta fase."""
from typing import Optional

from sqlalchemy import BigInteger, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ChatMensagem(Base, TimestampMixin):
    __tablename__ = "chat_mensagem"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    canal_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chat_canal.id", ondelete="CASCADE"), nullable=False)
    autor_envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    texto: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    anexo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

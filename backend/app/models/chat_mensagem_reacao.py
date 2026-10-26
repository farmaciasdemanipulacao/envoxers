"""Uma reação por emoji por pessoa e mensagem."""
from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin


class ChatMensagemReacao(Base, TimestampMixin):
    __tablename__ = "chat_mensagem_reacao"
    __table_args__ = (UniqueConstraint("mensagem_id", "envoxer_id", "emoji", name="uq_chat_mensagem_reacao_usuario_emoji"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mensagem_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("chat_mensagem.id", ondelete="CASCADE"), nullable=False, index=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(32), nullable=False)

"""Model: ChatLeitura — marca até quando cada envoxer já leu cada canal (base do badge de não lidas)."""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ChatLeitura(Base):
    __tablename__ = "chat_leitura"

    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), primary_key=True
    )
    canal_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("chat_canal.id", ondelete="CASCADE"), primary_key=True
    )
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

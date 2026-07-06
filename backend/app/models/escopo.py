"""Model: Escopo — 1:1 com cliente."""
from typing import Optional

from sqlalchemy import BigInteger, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Escopo(Base, TimestampMixin):
    __tablename__ = "escopo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    posts_mes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    videos_mes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    campanhas_mes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    limite_alteracoes: Mapped[int] = mapped_column(BigInteger, nullable=False, default=2)
    outros_itens: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

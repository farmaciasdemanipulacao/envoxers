"""Model: ChatCanal — canal do chat interno (geral / por cliente / DM 1:1)."""
from typing import Optional

from sqlalchemy import BigInteger, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_CANAL_VALUES = ("geral", "cliente", "dm")


class ChatCanal(Base, TimestampMixin):
    __tablename__ = "chat_canal"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_CANAL_VALUES, name="tipo_canal_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    cliente_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=True
    )
    # DM: sempre normalizado com o menor id em dm_envoxer_a_id — evita canal duplicado entre o mesmo par.
    dm_envoxer_a_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=True
    )
    dm_envoxer_b_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=True
    )

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

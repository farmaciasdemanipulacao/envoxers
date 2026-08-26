"""Model: Feedback1a1 — registro contínuo de conversa 1:1 entre gestor e liderado (F4, D-121)."""
from datetime import date
from typing import Optional

from sqlalchemy import BigInteger, Text, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Feedback1a1(Base, TimestampMixin):
    __tablename__ = "feedback_1a1"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    gestor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    liderado_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    data: Mapped[date] = mapped_column(Date, nullable=False)
    pauta: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    combinados: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comentario_liderado: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proximo_sugerido: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    criado_por_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

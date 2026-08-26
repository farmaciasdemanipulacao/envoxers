"""Model: Avaliacao360 — par avaliador->avaliado dentro de um CicloAvaliacao tipo 360 (F4, D-121)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Text, DateTime, Enum as SAEnum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_AVALIACAO_360_VALUES = ("pendente", "enviada")


class Avaliacao360(Base, TimestampMixin):
    __tablename__ = "avaliacao_360"
    __table_args__ = (UniqueConstraint("ciclo_id", "avaliador_id", "avaliado_id", name="uq_avaliacao_360_par"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ciclo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False)
    avaliador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    avaliado_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)

    # {competencia_id: nota 1-5}
    respostas: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    comentario: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_AVALIACAO_360_VALUES, name="status_avaliacao_360_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="pendente",
    )
    enviada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

"""Model: Avaliacao180 — avaliação mão dupla gestor<->liderado dentro de um CicloAvaliacao tipo 180 (F4, D-121)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Text, DateTime, Enum as SAEnum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

DIRECAO_AVALIACAO_180_VALUES = ("gestor_para_liderado", "liderado_para_gestor")
STATUS_AVALIACAO_180_VALUES = ("pendente", "enviada")


class Avaliacao180(Base, TimestampMixin):
    __tablename__ = "avaliacao_180"
    __table_args__ = (UniqueConstraint("ciclo_id", "avaliador_id", "avaliado_id", name="uq_avaliacao_180_par"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ciclo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False)
    avaliador_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    avaliado_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    direcao: Mapped[str] = mapped_column(
        SAEnum(*DIRECAO_AVALIACAO_180_VALUES, name="direcao_avaliacao_180_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )

    nota_geral: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pontos_fortes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pontos_melhoria: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comentario: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_AVALIACAO_180_VALUES, name="status_avaliacao_180_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="pendente",
    )
    enviada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

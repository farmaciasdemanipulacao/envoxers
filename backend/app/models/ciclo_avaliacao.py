"""Model: CicloAvaliacao — janela de tempo (F4, D-121) que organiza 360/180/clima."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Date, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_CICLO_VALUES = ("360", "180", "clima")
STATUS_CICLO_VALUES = ("rascunho", "aberto", "encerrado")


class CicloAvaliacao(Base, TimestampMixin):
    __tablename__ = "ciclo_avaliacao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_CICLO_VALUES, name="tipo_ciclo_avaliacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_CICLO_VALUES, name="status_ciclo_avaliacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="rascunho",
    )
    criado_por_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    aberto_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    encerrado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

"""Model: PdiAcao — item do Plano de Desenvolvimento Individual (F4, D-121)."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, Date, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_PDI_ACAO_VALUES = ("planejada", "em_andamento", "concluida", "cancelada")
# origem_tipo: de onde a ação nasceu — polimórfico de propósito (sem FK), origem_id
# aponta pra avaliacao_360.id / avaliacao_180.id / feedback_1a1.id conforme o tipo.
ORIGEM_PDI_ACAO_VALUES = ("manual", "360", "180", "1a1")


class PdiAcao(Base, TimestampMixin):
    __tablename__ = "pdi_acao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    categoria: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_PDI_ACAO_VALUES, name="status_pdi_acao_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="planejada",
    )

    origem_tipo: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    origem_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    criado_por_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    concluida_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

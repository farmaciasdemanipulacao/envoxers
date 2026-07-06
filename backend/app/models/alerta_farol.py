"""Model: AlertaFarol — nasce quando o farol calculado de um cliente muda de cor."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.farol_calculo import FAROL_COR_VALUES

STATUS_ALERTA_VALUES = ("aberto", "reconhecido", "resolvido", "ignorado")


class AlertaFarol(Base, TimestampMixin):
    __tablename__ = "alerta_farol"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    farol_de: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    farol_para: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    # Mesmo shape do FarolCalculo.motivo_json — snapshot dos sinais no momento da transição.
    motivo_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    motivo_texto: Mapped[str] = mapped_column(Text, nullable=False)
    sugestao_acao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_ALERTA_VALUES, name="status_alerta_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="aberto",
    )
    reconhecido_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    reconhecido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolucao_nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

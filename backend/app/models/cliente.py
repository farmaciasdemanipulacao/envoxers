"""Model: Cliente — enriquecido para ICP desde F0 (campos de F2/F3 já no schema, usados só em fases futuras)."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Numeric, Boolean, Date, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_RECEITA_VALUES = ("recorrente", "pontual")
CANAL_AQUISICAO_VALUES = ("indicacao", "inbound", "outbound", "evento", "sdr", "outro")
MATURIDADE_DIGITAL_VALUES = ("baixa", "media", "alta")
STATUS_FAROL_VALUES = ("verde", "amarelo", "vermelho")


class Cliente(Base, TimestampMixin):
    __tablename__ = "cliente"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Contrato
    valor_contrato: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    tipo_receita: Mapped[str] = mapped_column(
        SAEnum(*TIPO_RECEITA_VALUES, name="tipo_receita_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="recorrente",
    )
    data_inicio_contrato: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_cancelamento: Mapped[Optional[date]] = mapped_column(Date, nullable=True)  # F3 — churn

    # ICP (v3)
    segmento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    canal_aquisicao: Mapped[Optional[str]] = mapped_column(
        SAEnum(*CANAL_AQUISICAO_VALUES, name="canal_aquisicao_enum", values_callable=lambda e: list(e)),
        nullable=True,
    )
    ticket: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    maturidade_digital: Mapped[Optional[str]] = mapped_column(
        SAEnum(*MATURIDADE_DIGITAL_VALUES, name="maturidade_digital_enum", values_callable=lambda e: list(e)),
        nullable=True,
    )

    # Operacional
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    links_redes: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Placeholder até F2 — recalculado depois
    status_farol: Mapped[str] = mapped_column(
        SAEnum(*STATUS_FAROL_VALUES, name="status_farol_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="verde",
    )

    # Campos de F2 (termômetro WhatsApp) — já no schema.sql, sem uso em F0
    termometro_whatsapp: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    termometro_whatsapp_valor: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    termometro_whatsapp_ts: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ultima_interacao_ts: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

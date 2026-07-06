"""Model: ChurnSnapshot — congela o estado do cliente no momento do cancelamento (F3)."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Integer, Numeric, Date, DateTime, Text, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.perfil_cliente import PERFIL_CLIENTE_VALUES

FAROL_COR_VALUES = ("verde", "amarelo", "vermelho")


class ChurnSnapshot(Base):
    __tablename__ = "churn_snapshot"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    data_cancelamento: Mapped[date] = mapped_column(Date, nullable=False)
    meses_de_casa: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo_codigo: Mapped[str] = mapped_column(
        String(40), ForeignKey("motivo_churn_catalogo.codigo", ondelete="RESTRICT"), nullable=False
    )
    motivo_detalhe: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    quem_registrou_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

    cliente_nome_snap: Mapped[str] = mapped_column(String(160), nullable=False)
    segmento_snap: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    ticket_snap: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    canal_aquisicao_snap: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    maturidade_snap: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    perfil_snap: Mapped[Optional[str]] = mapped_column(
        SAEnum(*PERFIL_CLIENTE_VALUES, name="perfil_cliente_enum", values_callable=lambda e: list(e), create_type=False),
        nullable=True,
    )
    valor_contrato_snap: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    tipo_receita_snap: Mapped[str] = mapped_column(String(20), nullable=False)
    margem_media_snap: Mapped[Optional[float]] = mapped_column(Numeric(5, 1), nullable=True)
    pulso_medio_snap: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    farol_ultimo_snap: Mapped[Optional[str]] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e), create_type=False),
        nullable=True,
    )

    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

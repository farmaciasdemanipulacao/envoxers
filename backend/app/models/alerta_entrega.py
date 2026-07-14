"""Model: AlertaEntrega — nasce quando a reconciliação de um mês fechado mostra
gap entre contratado e entregue pra um ItemEscopo. Mesmo ciclo de vida do
AlertaFarol (aberto → reconhecido → resolvido/ignorado), tabela própria porque
o motivo/contexto é bem diferente (quantidade, não cor de farol).
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Integer, Text, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_ALERTA_ENTREGA_VALUES = ("aberto", "reconhecido", "resolvido", "ignorado")


class AlertaEntrega(Base, TimestampMixin):
    __tablename__ = "alerta_entrega"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    item_escopo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False
    )
    ano_mes: Mapped[str] = mapped_column(String(7), nullable=False)
    quantidade_contratada: Mapped[int] = mapped_column(Integer, nullable=False)
    quantidade_entregue: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo_texto: Mapped[str] = mapped_column(Text, nullable=False)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_ALERTA_ENTREGA_VALUES, name="status_alerta_entrega_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="aberto",
    )
    reconhecido_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    reconhecido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolvido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolucao_nota: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

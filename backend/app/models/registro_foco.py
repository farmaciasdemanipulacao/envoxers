"""Model: RegistroFoco — sessões de Foco (registro de tempo) do F1."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, Numeric, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class RegistroFoco(Base, TimestampMixin):
    __tablename__ = "registro_foco"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False
    )
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )

    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duracao_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Pausa real: pausado_em != NULL enquanto pausado; duracao_pausada_min acumula
    # os intervalos de pausa já fechados (somado de novo ao retomar).
    pausado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duracao_pausada_min: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Snapshot do custo_hora do envoxer no momento do fim — preserva o histórico
    # se o salário/custo_hora mudar depois.
    custo_hora_snapshot: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    custo: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

    comentario: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

"""Model: Etapa — subtarefa do checklist de processo dentro de uma Tarefa (card do Kanban)."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Text, Date, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_ETAPA_VALUES = ("pendente", "concluida")


class Etapa(Base, TimestampMixin):
    __tablename__ = "etapa"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsavel_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # Define a sequência de exibição e, junto com AutomacaoEtapa.LIBERAR_PROXIMA_ETAPA,
    # a ordem de liberação quando a trava está ativa.
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_ETAPA_VALUES, name="status_etapa_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="pendente",
    )
    concluida_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

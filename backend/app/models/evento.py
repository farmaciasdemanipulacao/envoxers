"""Model: Evento — eventos do calendário que NÃO são tarefa (reunião, captação, live, evento externo)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Text, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_EVENTO_VALUES = ("reuniao", "captacao", "evento_externo", "live", "outro")


class Evento(Base, TimestampMixin):
    __tablename__ = "evento"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_EVENTO_VALUES, name="tipo_evento_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="reuniao",
    )
    cliente_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="SET NULL"), nullable=True
    )
    data_inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    data_fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    dia_inteiro: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    local: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    criado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

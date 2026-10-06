from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

class DemandaAvulsa(Base, TimestampMixin):
    __tablename__ = "demanda_avulsa"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    contexto: Mapped[str] = mapped_column(String(160), nullable=False)
    titulo: Mapped[str] = mapped_column(String(220), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    criado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    prioridade: Mapped[str] = mapped_column(String(20), nullable=False, default="media")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="nova")
    concluida_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

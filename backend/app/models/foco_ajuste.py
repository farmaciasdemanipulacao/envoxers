from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

class FocoAjuste(Base, TimestampMixin):
    __tablename__ = "foco_ajuste"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    registro_foco_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("registro_foco.id", ondelete="SET NULL"), nullable=True)
    tarefa_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("tarefa.id", ondelete="SET NULL"), nullable=True)
    comercial_task_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_task.id", ondelete="SET NULL"), nullable=True)
    demanda_avulsa_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("demanda_avulsa.id", ondelete="SET NULL"), nullable=True)
    inicio_solicitado: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim_solicitado: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente")
    era_ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    decidido_por_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    decidido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    observacao_gestor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

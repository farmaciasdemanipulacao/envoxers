"""Model: EntregaCheck — cada unidade contratada de um Item de Escopo, dentro
do card único do mês (`Tarefa`). Ex.: item "post_social" quantidade=12 gera
1 Tarefa + 12 EntregaCheck (numero 1..12); o time marca cada um conforme
entrega. `excedente=True` marca um check adicionado manualmente (gestor/admin)
além da quantidade contratada.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class EntregaCheck(Base, TimestampMixin):
    __tablename__ = "entrega_check"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    entregue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    entregue_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    entregue_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    excedente: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

"""Campanha de comunicação — agrupador de jobs/tarefas do cliente.

Campanha é conceito distinto de recorrência: recorrência nasce de ItemEscopo e
provisiona Tarefa por ciclo; Campanha apenas organiza jobs relacionados a uma
mesma frente, lançamento, evento ou iniciativa.
"""
from datetime import date
from typing import Optional

from sqlalchemy import BigInteger, String, Text, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Campanha(Base, TimestampMixin):
    __tablename__ = "campanha"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome: Mapped[str] = mapped_column(String(180), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ativa")
    data_inicio: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    data_fim: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

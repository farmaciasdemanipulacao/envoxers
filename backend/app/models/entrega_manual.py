"""Model: EntregaManual — lançamento retroativo de entrega que não passou pelo
Kanban (ex.: entregue direto por WhatsApp, sem card). Consumido pela
reconciliação junto com as Tarefas finalizadas vinculadas ao item.
"""
from typing import Optional

from sqlalchemy import BigInteger, String, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class EntregaManual(Base, TimestampMixin):
    __tablename__ = "entrega_manual"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    item_escopo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False
    )
    ano_mes: Mapped[str] = mapped_column(String(7), nullable=False)  # "2026-07"
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False)
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lancado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

"""Model: ItemEscopoHistorico — toda mudança de quantidade de um ItemEscopo fica
registrada aqui (antes/depois/motivo/quem), pra nunca mais depender de
memória/WhatsApp pra saber quando e por que um combinado mudou.
"""
from typing import Optional

from sqlalchemy import BigInteger, Integer, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ItemEscopoHistorico(Base, TimestampMixin):
    __tablename__ = "item_escopo_historico"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    item_escopo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False
    )
    quantidade_anterior: Mapped[int] = mapped_column(Integer, nullable=False)
    quantidade_nova: Mapped[int] = mapped_column(Integer, nullable=False)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    alterado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    # Preenchido quando a mudança vem de um Documento de Acordo confirmado por
    # todos, em vez de edição manual direta.
    documento_acordo_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("documento_acordo.id", ondelete="SET NULL"), nullable=True
    )

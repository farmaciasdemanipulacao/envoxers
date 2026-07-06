"""Model: Aprovacao — histórico de decisões de aprovação de uma tarefa (interna E cliente)."""
from typing import Optional

from sqlalchemy import BigInteger, String, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

ETAPA_APROVACAO_VALUES = ("interna", "cliente")
DECISAO_APROVACAO_VALUES = ("aprovada", "pediu_ajuste")


class Aprovacao(Base, TimestampMixin):
    __tablename__ = "aprovacao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )
    etapa: Mapped[str] = mapped_column(
        SAEnum(*ETAPA_APROVACAO_VALUES, name="etapa_aprovacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    decisao: Mapped[str] = mapped_column(
        SAEnum(*DECISAO_APROVACAO_VALUES, name="decisao_aprovacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    decidido_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    # Nome de quem decidiu do lado do cliente — registrado pelo envoxer que operou a decisão.
    decidido_por_cliente_nome: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    comentario: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

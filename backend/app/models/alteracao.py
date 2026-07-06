"""Model: Alteracao — pedido de ajuste do cliente numa tarefa, contabilizado contra o limite do escopo."""
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Text, Enum as SAEnum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_ALTERACAO_VALUES = ("pendente", "em_execucao", "feita", "descartada")


class Alteracao(Base, TimestampMixin):
    __tablename__ = "alteracao"
    __table_args__ = (UniqueConstraint("tarefa_id", "numero", name="uq_alteracao_tarefa_numero"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )
    # Sequencial POR TAREFA (1, 2, 3...) — calculado na criação, não pelo cliente.
    numero: Mapped[int] = mapped_column(Integer, nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    solicitante_cliente_nome: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_ALTERACAO_VALUES, name="status_alteracao_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="pendente",
    )
    atendida_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

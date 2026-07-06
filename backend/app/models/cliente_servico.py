"""Model: ClienteServico — N:M cliente x serviço, com valor por serviço."""
from typing import Optional

from sqlalchemy import BigInteger, String, Numeric, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ClienteServico(Base, TimestampMixin):
    __tablename__ = "cliente_servico"
    __table_args__ = (UniqueConstraint("cliente_id", "servico_id", name="uq_cliente_servico"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    servico_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("servico.id", ondelete="RESTRICT"), nullable=False
    )
    valor_mensal: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    observacao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

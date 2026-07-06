"""Model: PulsoSatisfacao — nota mensal de satisfação do cliente (0-10), 1 registro por mês."""
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Text, Enum as SAEnum, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

METODO_PULSO_VALUES = ("ligacao", "pesquisa", "estimativa_interna", "conversa_avulsa")


class PulsoSatisfacao(Base, TimestampMixin):
    __tablename__ = "pulso_satisfacao"
    __table_args__ = (
        UniqueConstraint("cliente_id", "ano_mes", name="uq_pulso_cliente_mes"),
        CheckConstraint("nota BETWEEN 0 AND 10", name="chk_pulso_nota"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    # 'YYYY-MM' — chave natural do mês, junto com cliente_id.
    ano_mes: Mapped[str] = mapped_column(String(7), nullable=False)
    nota: Mapped[int] = mapped_column(Integer, nullable=False)
    comentario: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metodo: Mapped[str] = mapped_column(
        SAEnum(*METODO_PULSO_VALUES, name="metodo_pulso_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="ligacao",
    )
    respondente_cliente_nome: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    registrado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

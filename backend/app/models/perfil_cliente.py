"""Model: PerfilCliente — snapshot atual do perfil comportamental (fácil/neutro/difícil), F3."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, SmallInteger, Numeric, DateTime, Enum as SAEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

PERFIL_CLIENTE_VALUES = ("facil", "neutro", "dificil")


class PerfilCliente(Base):
    __tablename__ = "perfil_cliente"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    calculado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    perfil: Mapped[str] = mapped_column(
        SAEnum(*PERFIL_CLIENTE_VALUES, name="perfil_cliente_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    velocidade_aprovacao_dias: Mapped[Optional[float]] = mapped_column(Numeric(4, 1), nullable=True)
    alteracoes_media_por_tarefa: Mapped[Optional[float]] = mapped_column(Numeric(3, 1), nullable=True)
    atrasos_causados_pelo_cliente: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tarefas_avaliadas: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PerfilClienteHistorico(Base):
    __tablename__ = "perfil_cliente_historico"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    calculado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    perfil: Mapped[str] = mapped_column(
        SAEnum(*PERFIL_CLIENTE_VALUES, name="perfil_cliente_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    score: Mapped[int] = mapped_column(SmallInteger, nullable=False)

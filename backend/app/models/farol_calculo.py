"""Model: FarolCalculo — snapshot atual dos 8 sinais de saúde do cliente."""
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, Integer, SmallInteger, String, Numeric, DateTime, Enum as SAEnum, ForeignKey, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

FAROL_COR_VALUES = ("verde", "amarelo", "vermelho")
FAROL_COR_SEM_DADO_VALUES = ("verde", "amarelo", "vermelho", "sem_dado")


class FarolCalculo(Base):
    __tablename__ = "farol_calculo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    calculado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    farol: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    health_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    sinal_entrega: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    sinal_entrega_valor: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    sinal_atrasadas: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    sinal_atrasadas_valor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sinal_alteracoes: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    sinal_alteracoes_valor: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    sinal_aprovacoes: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    sinal_aprovacoes_valor: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    sinal_pulso: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_SEM_DADO_VALUES, name="farol_cor_sem_dado_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    sinal_pulso_valor: Mapped[Optional[int]] = mapped_column(SmallInteger, nullable=True)

    sinal_margem: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_SEM_DADO_VALUES, name="farol_cor_sem_dado_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    sinal_margem_valor: Mapped[Optional[float]] = mapped_column(Numeric(5, 1), nullable=True)

    sinal_silencio: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    sinal_silencio_valor: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sinal_whatsapp: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_SEM_DADO_VALUES, name="farol_cor_sem_dado_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    sinal_whatsapp_valor: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # {health_score, sinais_vermelhos: [...], sinais_amarelos: [...], sinais: {nome: {cor, valor}}}
    motivo_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)


class FarolCalculoHistorico(Base):
    __tablename__ = "farol_calculo_historico"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    calculado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    farol: Mapped[str] = mapped_column(
        SAEnum(*FAROL_COR_VALUES, name="farol_cor_enum", values_callable=lambda e: list(e)), nullable=False
    )
    health_score: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    motivo_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

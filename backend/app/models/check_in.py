"""Model: CheckIn — registro de contato com o cliente e sugestão de próximo contato."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, Date, Boolean, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_CHECKIN_VALUES = ("ligacao", "reuniao", "mensagem", "email", "presencial")
MOTIVO_CHECKIN_VALUES = ("rotina", "checkpoint_retencao", "alerta_farol", "alteracao_escopo", "outro")
HUMOR_CHECKIN_VALUES = ("positivo", "neutro", "negativo", "critico")


class CheckIn(Base, TimestampMixin):
    __tablename__ = "check_in"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    data_realizado: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_CHECKIN_VALUES, name="tipo_checkin_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    motivo: Mapped[str] = mapped_column(
        SAEnum(*MOTIVO_CHECKIN_VALUES, name="motivo_checkin_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="rotina",
    )
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    humor: Mapped[Optional[str]] = mapped_column(
        SAEnum(*HUMOR_CHECKIN_VALUES, name="humor_checkin_enum", values_callable=lambda e: list(e)),
        nullable=True,
    )
    observacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    proximo_sugerido: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    proximo_realizado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

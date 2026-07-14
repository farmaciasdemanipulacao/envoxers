"""Model: DocumentoConfirmacao — 1 linha por pessoa que precisa confirmar um
DocumentoAcordo (interno ou contato do cliente). Nome/e-mail são snapshot no
momento da criação (não mudam se a pessoa for editada/desativada depois —
o registro de auditoria tem que ficar congelado). IP e user-agent só são
preenchidos no momento da confirmação de verdade.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_CONFIRMANTE_VALUES = ("envoxer", "cliente_contato")


class DocumentoConfirmacao(Base, TimestampMixin):
    __tablename__ = "documento_confirmacao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    documento_acordo_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("documento_acordo.id", ondelete="CASCADE"), nullable=False
    )
    tipo_confirmante: Mapped[str] = mapped_column(
        SAEnum(*TIPO_CONFIRMANTE_VALUES, name="tipo_confirmante_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    cliente_contato_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("cliente_contato.id", ondelete="SET NULL"), nullable=True
    )
    nome_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)
    email_snapshot: Mapped[str] = mapped_column(String(160), nullable=False)

    confirmado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)

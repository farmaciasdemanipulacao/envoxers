"""Model: DocumentoAcordo — aditivo de escopo: itens que mudam de quantidade,
motivo, e quem precisa confirmar. Só vira "vigente" (e só aí atualiza o
ItemEscopo de verdade) quando TODAS as confirmações selecionadas acontecerem —
regra confirmada pelo Gus (não é maioria, é todo mundo)."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_DOCUMENTO_ACORDO_VALUES = ("aguardando_confirmacoes", "vigente", "cancelado")


class DocumentoAcordo(Base, TimestampMixin):
    __tablename__ = "documento_acordo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(40), nullable=False, default="aditivo_escopo")
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    # [{item_escopo_id, tipo, descricao, quantidade_anterior, quantidade_nova}]
    itens_alterados: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_DOCUMENTO_ACORDO_VALUES, name="status_documento_acordo_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="aguardando_confirmacoes",
    )
    criado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    vigente_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

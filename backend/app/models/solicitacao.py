"""Model: Solicitacao — inbox de pedidos do cliente, registrado pelo atendimento."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Text, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_SOLICITACAO_VALUES = ("novo_post", "alteracao", "material_extra", "campanha", "evento")
STATUS_SOLICITACAO_VALUES = ("nova", "em_analise", "virou_demanda", "recusada")


class Solicitacao(Base, TimestampMixin):
    __tablename__ = "solicitacao"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_SOLICITACAO_VALUES, name="tipo_solicitacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # [{nome, url, mime_type, tamanho_kb, enviado_por_envoxer_id, criado_em}] — mesmo padrão de Tarefa.anexos.
    anexos: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_SOLICITACAO_VALUES, name="status_solicitacao_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="nova",
    )
    motivo_recusa: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    tarefa_id_gerada: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="SET NULL"), nullable=True
    )

    solicitante_nome: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    atendido_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    respondido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

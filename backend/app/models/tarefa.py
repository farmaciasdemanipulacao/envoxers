"""Model: Tarefa — demanda que percorre o Kanban do F1."""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Integer, String, Text, Date, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

STATUS_TAREFA_VALUES = (
    "nova",
    "planejamento",
    "producao",
    "revisao_interna",
    "aprovacao_cliente",
    "ajustes",
    "programado",
    "finalizado",
)


class Tarefa(Base, TimestampMixin):
    __tablename__ = "tarefa"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="RESTRICT"), nullable=False
    )
    servico_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("servico.id", ondelete="SET NULL"), nullable=True
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_tarefa: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

    status: Mapped[str] = mapped_column(
        SAEnum(*STATUS_TAREFA_VALUES, name="status_tarefa_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="nova",
    )
    # Posição manual dentro da coluna — persiste a ordem do drag-and-drop.
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    prazo: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    etiqueta: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    # azul|amarelo|vermelho|verde|roxo|cinza — casa com as classes .tag-* já existentes no CSS.
    etiqueta_cor: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    criativo: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    legenda: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # [{envoxer_id, envoxer_nome, texto, criado_em}]
    comentarios: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    # [{nome, url, mime_type, tamanho_kb, enviado_por_envoxer_id, criado_em}]
    anexos: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Materializado — contagem de Alteracao vinculadas, usado no sinal 3 do Farol (F2).
    qtd_alteracoes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    aprovada_interna: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    aprovada_cliente: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Setado automaticamente quando status vira "finalizado" — usado no sinal 1 do Farol (F2).
    finalizada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

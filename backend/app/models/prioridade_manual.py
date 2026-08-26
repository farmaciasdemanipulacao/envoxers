"""Model: PrioridadeManual — ordem manual (drag-and-drop) que o dono do item (ou
gestor/admin organizando por ele) definiu na lista "prioridades de hoje" do
Dashboard, tanto pra Card (Tarefa) quanto pra Tarefa/Etapa (checklist).

Não tem `data` — a ordem vale enquanto o item continuar aparecendo na lista do
dia (atrasado ou vencendo hoje); some sozinha quando o item sai da lista
(concluído/prazo adiante), sem precisar de limpeza por data.
"""
from sqlalchemy import BigInteger, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

TIPO_PRIORIDADE_VALUES = ("card", "etapa")


class PrioridadeManual(Base, TimestampMixin):
    __tablename__ = "prioridade_manual"
    __table_args__ = (
        UniqueConstraint("envoxer_id", "tipo", "referencia_id", name="uq_prioridade_manual_item"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False
    )
    # "card" -> referencia_id = Tarefa.id | "etapa" -> referencia_id = Etapa.id
    tipo: Mapped[str] = mapped_column(String(10), nullable=False)
    referencia_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)

    tenant_id: Mapped[int] = mapped_column(BigInteger, nullable=True, default=1)

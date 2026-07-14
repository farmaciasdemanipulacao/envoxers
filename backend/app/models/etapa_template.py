"""Model: EtapaTemplate — etapa-modelo de um Serviço, usada como "receita" para
gerar Etapas reais numa Tarefa via POST /tarefas/{id}/aplicar-processo.
"""
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class EtapaTemplate(Base, TimestampMixin):
    __tablename__ = "etapa_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    servico_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("servico.id", ondelete="CASCADE"), nullable=False
    )
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Prazo relativo em dias a partir da data em que o processo é aplicado na Tarefa
    # (etapa_template não sabe a data real de nenhuma tarefa específica).
    prazo_dias: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

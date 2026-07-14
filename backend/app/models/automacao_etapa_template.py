"""Model: AutomacaoEtapaTemplate — mesma automação fechada de AutomacaoEtapa
(ver app/models/automacao_etapa.py), só que presa a uma EtapaTemplate em vez
de uma Etapa real. Copiada para a Etapa real quando o processo é aplicado.
"""
from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.models.automacao_etapa import ACAO_AUTOMACAO_VALUES


class AutomacaoEtapaTemplate(Base, TimestampMixin):
    __tablename__ = "automacao_etapa_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    etapa_template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("etapa_template.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    acao: Mapped[str] = mapped_column(
        SAEnum(*ACAO_AUTOMACAO_VALUES, name="acao_automacao_etapa_template_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    coluna_destino: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

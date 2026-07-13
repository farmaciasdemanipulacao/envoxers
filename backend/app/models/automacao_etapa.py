"""Model: AutomacaoEtapa — regra "quando a Etapa é concluída, faça Y", 1:1 com a Etapa.
Motor fechado de propósito (só as 4 ações abaixo) — não é um motor de regras genérico.
"""
from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

ACAO_AUTOMACAO_VALUES = (
    "LIBERAR_PROXIMA_ETAPA",
    "MOVER_TAREFA_COLUNA",
    "MARCAR_TAREFA_CONCLUIDA",
    "CRIAR_ALERTA_RESPONSAVEL",
)


class AutomacaoEtapa(Base, TimestampMixin):
    __tablename__ = "automacao_etapa"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    etapa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("etapa.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    acao: Mapped[str] = mapped_column(
        SAEnum(*ACAO_AUTOMACAO_VALUES, name="acao_automacao_etapa_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    # Só usado quando acao == MOVER_TAREFA_COLUNA — uma das chaves de STATUS_TAREFA_VALUES.
    coluna_destino: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

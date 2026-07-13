"""Model: Pendencia — aviso simples gerado pela automação CRIAR_ALERTA_RESPONSAVEL,
exibido na lista "Pendências" do Dashboard do envoxer destinatário.
"""
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Pendencia(Base, TimestampMixin):
    __tablename__ = "pendencia"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False
    )
    tarefa_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False
    )
    etapa_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("etapa.id", ondelete="CASCADE"), nullable=True
    )
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    lida: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

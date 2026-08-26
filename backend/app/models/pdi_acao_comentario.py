"""Model: PdiAcaoComentario — check-in de progresso numa ação do PDI (F4, D-121)."""
from datetime import datetime

from sqlalchemy import BigInteger, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PdiAcaoComentario(Base):
    __tablename__ = "pdi_acao_comentario"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    pdi_acao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("pdi_acao.id", ondelete="CASCADE"), nullable=False)
    autor_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

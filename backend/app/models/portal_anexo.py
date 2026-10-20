"""Private attachments have no public static URL."""
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Identity, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class PortalAnexo(Base):
    __tablename__ = "portal_anexo"
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    solicitacao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False)
    contato_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("cliente_contato.id", ondelete="SET NULL"))
    nome_original: Mapped[str] = mapped_column(String(255), nullable=False)
    chave: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

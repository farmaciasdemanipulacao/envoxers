"""Sessões temporárias com revogação e pareamento seguro por QR."""
from datetime import datetime
from typing import Optional
from sqlalchemy import BigInteger, ForeignKey, DateTime, String, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class SessaoWeb(Base):
    __tablename__ = "sessao_web"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False, index=True)
    modo: Mapped[str] = mapped_column(String(16), nullable=False)
    ip: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(String(300))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ultimo_acesso: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revogado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

class PareamentoWeb(Base):
    __tablename__ = "pareamento_web"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    poll_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    codigo: Mapped[str] = mapped_column(String(12), nullable=False, unique=True, index=True)
    ip: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(String(300))
    minutos: Mapped[int] = mapped_column(Integer, nullable=False, default=120)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    autorizado_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"))
    consumido_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

"""Ciclos, evidencias e acompanhamento do PDI interativo."""
from datetime import date, datetime
from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class PdiJornada(Base):
    __tablename__ = "pdi_jornada"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id"), nullable=False)
    gestor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id"), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    inicio: Mapped[date] = mapped_column(Date, nullable=False)
    fim: Mapped[date] = mapped_column(Date, nullable=False)
    lembrete_dia: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    lembrete_ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ativa")
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class PdiRegistro(Base):
    __tablename__ = "pdi_registro"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    jornada_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("pdi_jornada.id", ondelete="CASCADE"), nullable=False)
    autor_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id"), nullable=False)
    acao_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("pdi_acao.id", ondelete="SET NULL"))
    tipo: Mapped[str] = mapped_column(String(20), nullable=False)
    marco_dia: Mapped[int | None] = mapped_column(Integer)
    situacao: Mapped[str] = mapped_column(Text, nullable=False)
    impacto: Mapped[str | None] = mapped_column(Text)
    proposta: Mapped[str | None] = mapped_column(Text)
    resultado: Mapped[str | None] = mapped_column(Text)
    avaliacao: Mapped[int | None] = mapped_column(Integer)
    status_validacao: Mapped[str] = mapped_column(String(20), nullable=False, default="pendente")
    feedback_gestor: Mapped[str | None] = mapped_column(Text)
    validado_por_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("envoxer.id"))
    validado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class PdiLembreteEnvio(Base):
    __tablename__ = "pdi_lembrete_envio"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    destinatario_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id"), nullable=False)
    chave: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

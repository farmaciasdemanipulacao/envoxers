"""Monitoramento de presença: metadados mínimos, sem conteúdo de teclado/tela/câmera."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PresencaConfig(Base):
    __tablename__ = "presenca_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    monitoramento_ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    inatividade_min: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    alerta_min: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    retencao_dias: Mapped[int] = mapped_column(Integer, nullable=False, default=90)
    notificar_colaborador: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Mantido desligado até existir streaming com consentimento e testes ponta a ponta.
    camera_habilitada: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ultima_limpeza_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class PresencaEstado(Base):
    __tablename__ = "presenca_estado"

    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), primary_key=True
    )
    registro_foco_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("registro_foco.id", ondelete="SET NULL")
    )
    ultimo_heartbeat: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ultima_interacao: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    fonte: Mapped[Optional[str]] = mapped_column(String(16))
    intervalo_aberto_id: Mapped[Optional[int]] = mapped_column(BigInteger)


class PresencaIntervalo(Base):
    __tablename__ = "presenca_intervalo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False
    )
    registro_foco_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("registro_foco.id", ondelete="CASCADE"), nullable=False
    )
    inicio: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fim: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    ultima_observacao_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    alerta_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    fonte: Mapped[str] = mapped_column(String(16), nullable=False, default="desktop")


class PresencaAuditoria(Base):
    __tablename__ = "presenca_auditoria"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    admin_envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="RESTRICT"), nullable=False
    )
    acao: Mapped[str] = mapped_column(String(80), nullable=False)
    alvo_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    detalhes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

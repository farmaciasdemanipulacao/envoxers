"""Entidades do Portal. Dados operacionais continuam em Solicitacao/Tarefa/RegistroFoco."""
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Identity, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class PortalUnidade(Base):
    __tablename__ = "portal_unidade"
    __table_args__ = (UniqueConstraint("cliente_id", "tipo", "nome", name="uq_portal_unidade_nome"),)
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    cliente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    tipo: Mapped[str] = mapped_column(String(24), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

class PortalContatoUnidade(Base):
    __tablename__ = "portal_contato_unidade"
    contato_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cliente_contato.id", ondelete="CASCADE"), primary_key=True)
    unidade_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("portal_unidade.id", ondelete="CASCADE"), primary_key=True)

class PortalSolicitacaoTarefa(Base):
    __tablename__ = "portal_solicitacao_tarefa"
    solicitacao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("solicitacao.id", ondelete="CASCADE"), primary_key=True)
    tarefa_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tarefa.id", ondelete="CASCADE"), primary_key=True)

class PortalEvento(Base):
    __tablename__ = "portal_evento"
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    solicitacao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    publico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class PortalComentario(Base):
    __tablename__ = "portal_comentario"
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    solicitacao_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False)
    cliente_contato_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("cliente_contato.id", ondelete="SET NULL"))
    envoxer_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"))
    autor_nome: Mapped[str] = mapped_column(String(160), nullable=False)
    texto: Mapped[str] = mapped_column(Text, nullable=False)
    publico: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class PortalFormulario(Base):
    __tablename__ = "portal_formulario"
    __table_args__ = (UniqueConstraint("cliente_id", "versao", name="uq_portal_formulario_versao"),)
    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    cliente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False)
    versao: Mapped[int] = mapped_column(Integer, nullable=False)
    campos: Mapped[list] = mapped_column(JSONB, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

class PortalClienteConfig(Base):
    """Somente flags/permissões da experiência externa, sem replicar dados operacionais."""
    __tablename__ = "portal_cliente_config"
    cliente_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), primary_key=True)
    habilitado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    modulos: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notificacoes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    visibilidade: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

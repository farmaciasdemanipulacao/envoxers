from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Boolean, Date, DateTime, Text, ForeignKey, Numeric, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ComercialPipelineStage(Base):
    __tablename__ = "comercial_pipeline_stage"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tipo: Mapped[str] = mapped_column(String(30), default="aberto", nullable=False)


class ComercialLead(Base, TimestampMixin):
    __tablename__ = "comercial_lead"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    data_entrada: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    nome_estabelecimento: Mapped[str] = mapped_column(String(180), nullable=False)
    nome_fantasia: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    segmento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    subsegmento: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    cidade: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    estado: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    bairro: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    origem: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status_codigo: Mapped[str] = mapped_column(String(50), default="novo", nullable=False)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    observacoes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fit_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    opportunity_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    engagement_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    temperatura: Mapped[str] = mapped_column(String(20), default="frio", nullable=False)
    ultimo_contato_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    proxima_acao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    proxima_acao_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    nao_prospectar: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, default=1, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ComercialLeadContact(Base, TimestampMixin):
    __tablename__ = "comercial_lead_contact"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    cargo: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    telefone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    principal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class ComercialLeadChannel(Base, TimestampMixin):
    __tablename__ = "comercial_lead_channel"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    valor: Mapped[str] = mapped_column(String(1000), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ComercialAudit(Base, TimestampMixin):
    __tablename__ = "comercial_audit"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    executado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    resumo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tese_central: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    forcas: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    vazamentos: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    oportunidades: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    prioridade: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    risco_comercial: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    observacoes: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    modelo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)


class ComercialAuditSource(Base, TimestampMixin):
    __tablename__ = "comercial_audit_source"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    audit_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_audit.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    fonte: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(1200), nullable=True)
    evidencia: Mapped[str] = mapped_column(Text, nullable=False)
    consultado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ComercialInsight(Base, TimestampMixin):
    __tablename__ = "comercial_insight"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    audit_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_audit.id", ondelete="CASCADE"), nullable=True)
    categoria: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    titulo: Mapped[str] = mapped_column(String(220), nullable=False)
    evidencia: Mapped[str] = mapped_column(Text, nullable=False)
    impacto: Mapped[str] = mapped_column(Text, nullable=False)
    fonte: Mapped[Optional[str]] = mapped_column(String(400), nullable=True)
    grau_confianca: Mapped[str] = mapped_column(String(30), default="medio", nullable=False)
    utilizado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    utilizado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ComercialMessage(Base, TimestampMixin):
    __tablename__ = "comercial_message"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    direcao: Mapped[str] = mapped_column(String(20), nullable=False)
    canal: Mapped[str] = mapped_column(String(30), nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    insight_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_insight.id", ondelete="SET NULL"), nullable=True)
    status_antes: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status_depois: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    enviado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metadados: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    objecao_categoria: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    status_envio: Mapped[str] = mapped_column(String(30), default="registrada", nullable=False)
    gerado_por_ia: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    aprovado_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ComercialActivity(Base):
    __tablename__ = "comercial_activity"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    usuario_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    dados: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ComercialTask(Base, TimestampMixin):
    __tablename__ = "comercial_task"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    titulo: Mapped[str] = mapped_column(String(220), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    prazo: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pendente", nullable=False)
    tipo: Mapped[str] = mapped_column(String(50), default="comercial", nullable=False)
    concluida_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ComercialCadence(Base, TimestampMixin):
    __tablename__ = "comercial_cadence"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativa: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ComercialCadenceStep(Base):
    __tablename__ = "comercial_cadence_step"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cadence_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_cadence.id", ondelete="CASCADE"), nullable=False)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False)
    dias_apos_inicio: Mapped[int] = mapped_column(Integer, nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), nullable=False)
    orientacao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ComercialLeadCadence(Base, TimestampMixin):
    __tablename__ = "comercial_lead_cadence"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    cadence_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_cadence.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ativa", nullable=False)
    iniciada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    proximo_step_ordem: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    pausada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    proximo_step_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    encerrada_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ComercialOpportunity(Base, TimestampMixin):
    __tablename__ = "comercial_opportunity"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    contato: Mapped[Optional[str]] = mapped_column(String(180), nullable=True)
    dor_principal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    solucao_provavel: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    servicos_relacionados: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)
    valor_estimado: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    probabilidade: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    etapa: Mapped[str] = mapped_column(String(60), default="oportunidade", nullable=False)
    proxima_acao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    data_prevista: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    responsavel_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)


class ComercialAIGeneration(Base):
    __tablename__ = "comercial_ai_generation"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    usuario_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    modelo: Mapped[str] = mapped_column(String(80), nullable=False)
    prompt_version: Mapped[str] = mapped_column(String(40), nullable=False)
    entrada: Mapped[dict] = mapped_column(JSONB, nullable=False)
    resultado: Mapped[dict] = mapped_column(JSONB, nullable=False)
    tokens_entrada: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    tokens_saida: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ComercialSuppression(Base):
    __tablename__ = "comercial_suppression"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=True)
    tipo: Mapped[str] = mapped_column(String(30), nullable=False)
    valor: Mapped[str] = mapped_column(String(300), nullable=False)
    motivo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_envoxer_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ComercialTag(Base):
    __tablename__ = "comercial_tag"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)


class ComercialLeadTag(Base):
    __tablename__ = "comercial_lead_tag"
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_tag.id", ondelete="CASCADE"), primary_key=True)


class ComercialLeadFact(Base, TimestampMixin):
    __tablename__ = "comercial_lead_fact"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False)
    tipo: Mapped[str] = mapped_column(String(40), default="fato", nullable=False)
    conteudo: Mapped[str] = mapped_column(Text, nullable=False)
    fonte_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("comercial_audit_source.id", ondelete="SET NULL"), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ComercialIntegration(Base, TimestampMixin):
    __tablename__ = "comercial_integration"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    provider: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    configurado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    config_publica: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    credenciais_encriptadas: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ultimo_teste_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    ultimo_teste_ok: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    ultimo_erro: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ultima_sincronizacao_em: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

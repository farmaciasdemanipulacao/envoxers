"""CRM Comercial operacional: memória, integrações e campos de execução.

Revision ID: 0037_comercial_operacional
Revises: 0036_comercial_prospect
Create Date: 2026-09-10
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0037_comercial_operacional"
down_revision: Union[str, None] = "0036_comercial_prospect"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("comercial_message", sa.Column("objecao_categoria", sa.String(80), nullable=True))
    op.add_column("comercial_message", sa.Column("status_envio", sa.String(30), nullable=False, server_default="registrada"))
    op.add_column("comercial_message", sa.Column("gerado_por_ia", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("comercial_message", sa.Column("aprovado_em", sa.DateTime(timezone=True), nullable=True))

    op.add_column("comercial_task", sa.Column("tipo", sa.String(50), nullable=False, server_default="comercial"))
    op.add_column("comercial_task", sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_comercial_task_status_prazo", "comercial_task", ["status", "prazo"])

    op.add_column("comercial_lead_cadence", sa.Column("proximo_step_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("comercial_lead_cadence", sa.Column("encerrada_em", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_comercial_lead_cadence_status", "comercial_lead_cadence", ["status", "proximo_step_em"])

    op.create_table(
        "comercial_lead_fact",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("lead_id", sa.BigInteger(), sa.ForeignKey("comercial_lead.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False, server_default="fato"),
        sa.Column("conteudo", sa.Text(), nullable=False),
        sa.Column("fonte_id", sa.BigInteger(), sa.ForeignKey("comercial_audit_source.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_comercial_lead_fact_lead", "comercial_lead_fact", ["lead_id", "tipo"])

    op.create_table(
        "comercial_integration",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("provider", sa.String(80), nullable=False, unique=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("configurado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("config_publica", JSONB, nullable=False, server_default="{}"),
        sa.Column("ultima_sincronizacao_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    integration = sa.table(
        "comercial_integration",
        sa.column("provider", sa.String),
        sa.column("nome", sa.String),
        sa.column("ativo", sa.Boolean),
        sa.column("configurado", sa.Boolean),
        sa.column("config_publica", JSONB),
    )
    op.bulk_insert(integration, [
        {"provider": "openai", "nome": "OpenAI", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "whatsapp", "nome": "WhatsApp Business Cloud", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "instagram", "nome": "Instagram Messaging / Meta", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "email", "nome": "E-mail", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "google_places", "nome": "Google Maps / Places", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "pesquisa", "nome": "Pesquisa pública / coleta autorizada", "ativo": False, "configurado": False, "config_publica": {}},
        {"provider": "webhooks", "nome": "Webhooks / n8n / Make / Zapier", "ativo": False, "configurado": False, "config_publica": {}},
    ])


def downgrade() -> None:
    op.drop_table("comercial_integration")
    op.drop_index("ix_comercial_lead_fact_lead", table_name="comercial_lead_fact")
    op.drop_table("comercial_lead_fact")
    op.drop_index("ix_comercial_lead_cadence_status", table_name="comercial_lead_cadence")
    op.drop_column("comercial_lead_cadence", "encerrada_em")
    op.drop_column("comercial_lead_cadence", "proximo_step_em")
    op.drop_index("ix_comercial_task_status_prazo", table_name="comercial_task")
    op.drop_column("comercial_task", "concluida_em")
    op.drop_column("comercial_task", "tipo")
    op.drop_column("comercial_message", "aprovado_em")
    op.drop_column("comercial_message", "gerado_por_ia")
    op.drop_column("comercial_message", "status_envio")
    op.drop_column("comercial_message", "objecao_categoria")

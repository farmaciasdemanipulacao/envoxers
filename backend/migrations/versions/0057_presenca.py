"""Metadados mínimos de presença, isolados do registro de Foco.

Revision ID: 0057_presenca
Revises: chat_reactions_20261023
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0057_presenca"
down_revision = "chat_reactions_20261023"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "presenca_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("monitoramento_ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("inatividade_min", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("alerta_min", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("retencao_dias", sa.Integer(), nullable=False, server_default="90"),
        sa.Column("notificar_colaborador", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("camera_habilitada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("ultima_limpeza_em", sa.DateTime(timezone=True)),
    )
    op.execute("INSERT INTO presenca_config (id) VALUES (1)")
    op.create_table(
        "presenca_estado",
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("registro_foco_id", sa.BigInteger(), sa.ForeignKey("registro_foco.id", ondelete="SET NULL")),
        sa.Column("ultimo_heartbeat", sa.DateTime(timezone=True)),
        sa.Column("ultima_interacao", sa.DateTime(timezone=True)),
        sa.Column("fonte", sa.String(16)),
        sa.Column("intervalo_aberto_id", sa.BigInteger()),
    )
    op.create_table(
        "presenca_intervalo",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registro_foco_id", sa.BigInteger(), sa.ForeignKey("registro_foco.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fim", sa.DateTime(timezone=True)),
        sa.Column("ultima_observacao_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("alerta_em", sa.DateTime(timezone=True)),
        sa.Column("fonte", sa.String(16), nullable=False),
    )
    op.create_index("ix_presenca_intervalo_foco", "presenca_intervalo", ["registro_foco_id", "inicio"])
    op.create_index("ix_presenca_intervalo_usuario", "presenca_intervalo", ["envoxer_id", "inicio"])
    op.create_table(
        "presenca_auditoria",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("admin_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("acao", sa.String(80), nullable=False),
        sa.Column("alvo_envoxer_id", sa.BigInteger()),
        sa.Column("detalhes", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_presenca_auditoria_criado_em", "presenca_auditoria", ["criado_em"])


def downgrade():
    op.drop_index("ix_presenca_auditoria_criado_em", table_name="presenca_auditoria")
    op.drop_table("presenca_auditoria")
    op.drop_index("ix_presenca_intervalo_usuario", table_name="presenca_intervalo")
    op.drop_index("ix_presenca_intervalo_foco", table_name="presenca_intervalo")
    op.drop_table("presenca_intervalo")
    op.drop_table("presenca_estado")
    op.drop_table("presenca_config")

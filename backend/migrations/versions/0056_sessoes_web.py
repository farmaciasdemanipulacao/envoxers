"""Sessões web revogáveis e pareamento QR.

Revision ID: 0056
Revises: 0055
"""
from alembic import op
import sqlalchemy as sa
revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        "sessao_web",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("modo", sa.String(16), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ultimo_acesso", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revogado_em", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_sessao_web_envoxer_id", "sessao_web", ["envoxer_id"])
    op.create_table(
        "pareamento_web",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("poll_hash", sa.String(64), nullable=False),
        sa.Column("codigo", sa.String(12), nullable=False, unique=True),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("minutos", sa.Integer(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expira_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("autorizado_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL")),
        sa.Column("consumido_em", sa.DateTime(timezone=True)),
    )

def downgrade():
    op.drop_table("pareamento_web")
    op.drop_index("ix_sessao_web_envoxer_id", table_name="sessao_web")
    op.drop_table("sessao_web")

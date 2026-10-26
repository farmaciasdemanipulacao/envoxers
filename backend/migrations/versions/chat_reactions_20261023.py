"""Reações individuais nas mensagens internas.

Revision ID: chat_reactions_20261023
Revises: chat_reply_20261023
"""
from alembic import op
import sqlalchemy as sa

revision = "chat_reactions_20261023"
down_revision = "chat_reply_20261023"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "chat_mensagem_reacao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("mensagem_id", sa.BigInteger(), sa.ForeignKey("chat_mensagem.id", ondelete="CASCADE"), nullable=False),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("mensagem_id", "envoxer_id", "emoji", name="uq_chat_mensagem_reacao_usuario_emoji"),
    )
    op.create_index("ix_chat_mensagem_reacao_mensagem_id", "chat_mensagem_reacao", ["mensagem_id"])


def downgrade():
    op.drop_index("ix_chat_mensagem_reacao_mensagem_id", table_name="chat_mensagem_reacao")
    op.drop_table("chat_mensagem_reacao")

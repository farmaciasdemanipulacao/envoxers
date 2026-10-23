"""Vincula respostas às mensagens originais, sem alterar histórico existente.

Revision ID: chat_reply_20261023
Revises: 0056
"""
from alembic import op
import sqlalchemy as sa

revision = "chat_reply_20261023"
down_revision = "0056"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("chat_mensagem", sa.Column("resposta_a_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_chat_mensagem_resposta_a_id",
        "chat_mensagem", "chat_mensagem",
        ["resposta_a_id"], ["id"], ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint("fk_chat_mensagem_resposta_a_id", "chat_mensagem", type_="foreignkey")
    op.drop_column("chat_mensagem", "resposta_a_id")

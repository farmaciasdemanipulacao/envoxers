"""Chat com metadados de anexo e tipo de pendencia.

Revision ID: 0054
Revises: 0053
"""
from alembic import op
import sqlalchemy as sa

revision = "0054"
down_revision = "0053"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("chat_mensagem", sa.Column("anexo_nome", sa.String(300), nullable=True))
    op.add_column("chat_mensagem", sa.Column("anexo_mime_type", sa.String(160), nullable=True))
    op.add_column("chat_mensagem", sa.Column("anexo_tamanho_kb", sa.BigInteger(), nullable=True))
    op.add_column(
        "pendencia",
        sa.Column("tipo", sa.String(30), nullable=False, server_default="geral"),
    )
    op.execute("""
        UPDATE pendencia
        SET tipo = 'mencao'
        WHERE mensagem ILIKE '%te mencionou num comentário%'
    """)


def downgrade():
    op.drop_column("pendencia", "tipo")
    op.drop_column("chat_mensagem", "anexo_tamanho_kb")
    op.drop_column("chat_mensagem", "anexo_mime_type")
    op.drop_column("chat_mensagem", "anexo_nome")

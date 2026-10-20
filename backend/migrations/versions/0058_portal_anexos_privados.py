"""Portal private attachments. Revision ID: 0058, revises 0057."""
from alembic import op
import sqlalchemy as sa
revision = "0058"
down_revision = "0057"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("portal_anexo",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("solicitacao_id", sa.BigInteger(), sa.ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contato_id", sa.BigInteger(), sa.ForeignKey("cliente_contato.id", ondelete="SET NULL")),
        sa.Column("nome_original", sa.String(255), nullable=False),
        sa.Column("chave", sa.String(80), nullable=False, unique=True),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("tamanho_bytes", sa.BigInteger(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_portal_anexo_solicitacao", "portal_anexo", ["solicitacao_id"])

def downgrade():
    op.drop_index("ix_portal_anexo_solicitacao", table_name="portal_anexo")
    op.drop_table("portal_anexo")

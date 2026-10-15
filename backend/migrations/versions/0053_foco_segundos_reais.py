"""Foco em segundos reais.

Revision ID: 0053
Revises: 0052
"""
from alembic import op
import sqlalchemy as sa

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("registro_foco", sa.Column("duracao_segundos", sa.Integer(), nullable=True))
    op.add_column(
        "registro_foco",
        sa.Column("duracao_pausada_segundos", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("""
        UPDATE registro_foco
        SET duracao_segundos = GREATEST(COALESCE(duracao_min, 0) * 60, 0)
        WHERE fim IS NOT NULL AND duracao_segundos IS NULL
    """)
    op.execute("""
        UPDATE registro_foco
        SET duracao_pausada_segundos = GREATEST(COALESCE(duracao_pausada_min, 0) * 60, 0)
    """)


def downgrade():
    op.drop_column("registro_foco", "duracao_pausada_segundos")
    op.drop_column("registro_foco", "duracao_segundos")

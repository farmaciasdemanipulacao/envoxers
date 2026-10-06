"""Feedback interno do sistema.

Revision ID: 0042_feedback_sistema
Revises: 0041_chat_edit_delete
Create Date: 2026-10-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0042_feedback_sistema"
down_revision: Union[str, None] = "0041_chat_edit_delete"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "feedback_sistema",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("tipo", sa.String(length=30), nullable=False),
        sa.Column("titulo", sa.String(length=180), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("pagina", sa.String(length=500), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="novo"),
        sa.Column("criado_por_envoxer_id", sa.BigInteger(), nullable=True),
        sa.Column("criado_por_nome", sa.String(length=160), nullable=False),
        sa.Column("observacao_admin", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["criado_por_envoxer_id"], ["envoxer.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedback_sistema_status", "feedback_sistema", ["status"], unique=False)

def downgrade() -> None:
    op.drop_index("ix_feedback_sistema_status", table_name="feedback_sistema")
    op.drop_table("feedback_sistema")

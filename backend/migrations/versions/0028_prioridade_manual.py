"""Prioridade manual (drag-and-drop) das listas "prioridades de hoje" do Dashboard

Guarda a ordem manual escolhida pra Card (Tarefa) e Tarefa/Etapa (checklist),
por dono do item — envoxer só grava a própria, gestor/admin grava de qualquer um.

Revision ID: 0028_prioridade_manual
Revises: 0027_acesso_log_app_instal
Create Date: 2026-08-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0028_prioridade_manual"
down_revision: Union[str, None] = "0027_acesso_log_app_instal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "prioridade_manual",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=10), nullable=False),
        sa.Column("referencia_id", sa.BigInteger(), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False),
        sa.Column("tenant_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("envoxer_id", "tipo", "referencia_id", name="uq_prioridade_manual_item"),
    )
    op.create_index("ix_prioridade_manual_envoxer_id", "prioridade_manual", ["envoxer_id"])


def downgrade() -> None:
    op.drop_index("ix_prioridade_manual_envoxer_id", table_name="prioridade_manual")
    op.drop_table("prioridade_manual")

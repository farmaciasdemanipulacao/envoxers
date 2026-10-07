"""Ciclo de validacao do solicitante em Erros e Sugestoes.

Revision ID: 0046_feedback_validation
Revises: 0045_access_feedback
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0046_feedback_validation"
down_revision: Union[str, None] = "0045_access_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedback_sistema_interacao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "feedback_id",
            sa.BigInteger(),
            sa.ForeignKey("feedback_sistema.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(length=40), nullable=False),
        sa.Column(
            "autor_envoxer_id",
            sa.BigInteger(),
            sa.ForeignKey("envoxer.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("autor_nome", sa.String(length=160), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("screenshot_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_feedback_sistema_interacao_feedback_id",
        "feedback_sistema_interacao",
        ["feedback_id"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_sistema_interacao_tipo",
        "feedback_sistema_interacao",
        ["tipo"],
        unique=False,
    )
    op.execute("UPDATE feedback_sistema SET status = 'concluido' WHERE status = 'feito'")


def downgrade() -> None:
    op.execute("UPDATE feedback_sistema SET status = 'feito' WHERE status = 'concluido'")
    op.drop_index("ix_feedback_sistema_interacao_tipo", table_name="feedback_sistema_interacao")
    op.drop_index("ix_feedback_sistema_interacao_feedback_id", table_name="feedback_sistema_interacao")
    op.drop_table("feedback_sistema_interacao")

"""Alertas individuais de novos erros e sugestoes.

Revision ID: 0047_feedback_alert_views
Revises: 0046_feedback_validation
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0047_feedback_alert_views"
down_revision: Union[str, None] = "0046_feedback_validation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "feedback_sistema",
        sa.Column("alertavel", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    # Não transformar o backlog histórico em uma avalanche de "novo alerta".
    op.execute("UPDATE feedback_sistema SET alertavel = false")

    op.create_table(
        "feedback_sistema_visualizacao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "feedback_id",
            sa.BigInteger(),
            sa.ForeignKey("feedback_sistema.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "envoxer_id",
            sa.BigInteger(),
            sa.ForeignKey("envoxer.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("feedback_id", "envoxer_id", name="uq_feedback_visualizacao_usuario"),
    )
    op.create_index(
        "ix_feedback_sistema_visualizacao_feedback_id",
        "feedback_sistema_visualizacao",
        ["feedback_id"],
        unique=False,
    )
    op.create_index(
        "ix_feedback_sistema_visualizacao_envoxer_id",
        "feedback_sistema_visualizacao",
        ["envoxer_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_feedback_sistema_visualizacao_envoxer_id",
        table_name="feedback_sistema_visualizacao",
    )
    op.drop_index(
        "ix_feedback_sistema_visualizacao_feedback_id",
        table_name="feedback_sistema_visualizacao",
    )
    op.drop_table("feedback_sistema_visualizacao")
    op.drop_column("feedback_sistema", "alertavel")

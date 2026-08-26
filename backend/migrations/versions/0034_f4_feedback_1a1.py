"""F4 — Módulo E: Feedback 1:1 (registro contínuo por par gestor<->liderado, sem ciclo)

Revision ID: 0034_f4_feedback_1a1
Revises: 0033_f4_avaliacao_180
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0034_f4_feedback_1a1"
down_revision: Union[str, None] = "0033_f4_avaliacao_180"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "feedback_1a1",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("gestor_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("liderado_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data", sa.Date(), nullable=False),
        sa.Column("pauta", sa.Text(), nullable=True),
        sa.Column("combinados", sa.Text(), nullable=True),
        sa.Column("comentario_liderado", sa.Text(), nullable=True),
        sa.Column("proximo_sugerido", sa.Date(), nullable=True),
        sa.Column("criado_por_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_feedback_1a1_gestor_id", "feedback_1a1", ["gestor_id"])
    op.create_index("ix_feedback_1a1_liderado_id", "feedback_1a1", ["liderado_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_1a1_liderado_id", table_name="feedback_1a1")
    op.drop_index("ix_feedback_1a1_gestor_id", table_name="feedback_1a1")
    op.drop_table("feedback_1a1")

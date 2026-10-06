"""Feedback screenshot e Foco em tarefa comercial.

Revision ID: 0043_feedback_foco
Revises: 0042_feedback_sistema
Create Date: 2026-10-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0043_feedback_foco"
down_revision: Union[str, None] = "0042_feedback_sistema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column("feedback_sistema", sa.Column("screenshot_url", sa.String(length=500), nullable=True))
    op.alter_column("registro_foco", "tarefa_id", existing_type=sa.BigInteger(), nullable=True)
    op.add_column("registro_foco", sa.Column("comercial_task_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_registro_foco_comercial_task",
        "registro_foco", "comercial_task",
        ["comercial_task_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_registro_foco_comercial_task_id", "registro_foco", ["comercial_task_id"], unique=False)
    op.create_check_constraint(
        "ck_registro_foco_um_contexto",
        "registro_foco",
        "num_nonnulls(tarefa_id, comercial_task_id) = 1",
    )

def downgrade() -> None:
    op.drop_constraint("ck_registro_foco_um_contexto", "registro_foco", type_="check")
    op.drop_index("ix_registro_foco_comercial_task_id", table_name="registro_foco")
    op.drop_constraint("fk_registro_foco_comercial_task", "registro_foco", type_="foreignkey")
    op.drop_column("registro_foco", "comercial_task_id")
    op.alter_column("registro_foco", "tarefa_id", existing_type=sa.BigInteger(), nullable=False)
    op.drop_column("feedback_sistema", "screenshot_url")

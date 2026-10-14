"""Historico auditavel das etapas do card.

Revision ID: 0051_tarefa_historico_etapas
Revises: 0050_registro_foco_ajustes_admin
Create Date: 2026-10-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0051_tarefa_historico_etapas"
down_revision: Union[str, None] = "0050_registro_foco_ajustes_admin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tarefa",
        sa.Column(
            "historico_etapas",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("tarefa", "historico_etapas")

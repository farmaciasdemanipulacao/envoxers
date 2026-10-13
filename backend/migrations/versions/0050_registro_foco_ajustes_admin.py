"""Auditoria de correções administrativas de Foco.

Revision ID: 0050_registro_foco_ajustes_admin
Revises: 0049_demanda_avulsa_anexos
Create Date: 2026-10-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0050_registro_foco_ajustes_admin"
down_revision: Union[str, None] = "0049_demanda_avulsa_anexos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registro_foco",
        sa.Column(
            "ajustes_admin",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("registro_foco", "ajustes_admin")

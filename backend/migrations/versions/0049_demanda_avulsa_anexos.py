"""Anexos de demandas avulsas.

Revision ID: 0049_demanda_avulsa_anexos
Revises: 0048_demanda_avulsa_workspace
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0049_demanda_avulsa_anexos"
down_revision: Union[str, None] = "0048_demanda_avulsa_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "demanda_avulsa",
        sa.Column(
            "anexos",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("demanda_avulsa", "anexos")

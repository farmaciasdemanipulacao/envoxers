"""Sincroniza sequência de ID das cadências comerciais.

Revision ID: 0038_comercial_cadence_sequence
Revises: 0037_comercial_operacional
Create Date: 2026-09-10
"""
from typing import Sequence, Union
from alembic import op

revision: str = "0038_comercial_cadence_sequence"
down_revision: Union[str, None] = "0037_comercial_operacional"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        SELECT setval(
            pg_get_serial_sequence('comercial_cadence', 'id'),
            GREATEST(COALESCE((SELECT MAX(id) FROM comercial_cadence), 1), 1),
            true
        )
    """)


def downgrade() -> None:
    pass

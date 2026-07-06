"""RegistroFoco — descartado (grace period: sessões < 2min não contam)

Revision ID: 0010_registro_foco_descartado
Revises: 0009_f2_farol_alertas
Create Date: 2026-07-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0010_registro_foco_descartado"
down_revision: Union[str, None] = "0009_f2_farol_alertas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registro_foco",
        sa.Column("descartado", sa.Boolean, nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("registro_foco", "descartado")

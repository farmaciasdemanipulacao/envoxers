"""Envoxer — salario_mensal e horas_mes (custo_hora passa a ser calculado)

Revision ID: 0002_envoxer_salario
Revises: 0001_f0_schema
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0002_envoxer_salario"
down_revision: Union[str, None] = "0001_f0_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("envoxer", sa.Column("salario_mensal", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "envoxer",
        sa.Column("horas_mes", sa.Integer, nullable=False, server_default="220"),
    )


def downgrade() -> None:
    op.drop_column("envoxer", "horas_mes")
    op.drop_column("envoxer", "salario_mensal")

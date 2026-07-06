"""RegistroFoco — comentario (opcional, preenchido ao finalizar)

Revision ID: 0005_foco_comentario
Revises: 0004_foco_pausa
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_foco_comentario"
down_revision: Union[str, None] = "0004_foco_pausa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("registro_foco", sa.Column("comentario", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("registro_foco", "comentario")

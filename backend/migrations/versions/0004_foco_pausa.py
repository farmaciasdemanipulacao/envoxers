"""RegistroFoco — pausa real (pausado_em + duracao_pausada_min)

Revision ID: 0004_foco_pausa
Revises: 0003_tarefa_foco
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_foco_pausa"
down_revision: Union[str, None] = "0003_tarefa_foco"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("registro_foco", sa.Column("pausado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "registro_foco",
        sa.Column("duracao_pausada_min", sa.Integer, nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("registro_foco", "duracao_pausada_min")
    op.drop_column("registro_foco", "pausado_em")

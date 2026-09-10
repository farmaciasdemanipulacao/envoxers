"""Central segura de integrações do Comercial.

Revision ID: 0039_comercial_integracoes
Revises: 0038_comercial_cadence_sequence
Create Date: 2026-09-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0039_comercial_integracoes"
down_revision: Union[str, None] = "0038_comercial_cadence_sequence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("comercial_integration", sa.Column("credenciais_encriptadas", sa.Text(), nullable=True))
    op.add_column("comercial_integration", sa.Column("ultimo_teste_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("comercial_integration", sa.Column("ultimo_teste_ok", sa.Boolean(), nullable=True))
    op.add_column("comercial_integration", sa.Column("ultimo_erro", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("comercial_integration", "ultimo_erro")
    op.drop_column("comercial_integration", "ultimo_teste_ok")
    op.drop_column("comercial_integration", "ultimo_teste_em")
    op.drop_column("comercial_integration", "credenciais_encriptadas")

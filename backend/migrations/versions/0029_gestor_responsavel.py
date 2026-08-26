"""F4 — Módulo 0: Gestor Responsável

Base estrutural pra Avaliação 180° (mão dupla) e Feedback 1:1, que precisam de
um par específico gestor<->liderado — o projeto até aqui só tinha papéis
globais (admin/gestor/envoxer), sem hierarquia pessoa-a-pessoa.

Revision ID: 0029_gestor_responsavel
Revises: 0028_prioridade_manual
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029_gestor_responsavel"
down_revision: Union[str, None] = "0028_prioridade_manual"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "envoxer",
        sa.Column(
            "gestor_responsavel_id", sa.BigInteger(),
            sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True,
        ),
    )
    op.create_index("ix_envoxer_gestor_responsavel_id", "envoxer", ["gestor_responsavel_id"])


def downgrade() -> None:
    op.drop_index("ix_envoxer_gestor_responsavel_id", table_name="envoxer")
    op.drop_column("envoxer", "gestor_responsavel_id")

"""Workspace e auditoria de demandas avulsas.

Revision ID: 0048_demanda_avulsa_workspace
Revises: 0047_feedback_alert_views
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0048_demanda_avulsa_workspace"
down_revision: Union[str, None] = "0047_feedback_alert_views"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "demanda_avulsa",
        sa.Column("comentarios", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "demanda_avulsa",
        sa.Column("checklist", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "demanda_avulsa",
        sa.Column("historico", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column(
        "demanda_avulsa",
        sa.Column("qtd_alteracoes_prazo", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("demanda_avulsa", "qtd_alteracoes_prazo")
    op.drop_column("demanda_avulsa", "historico")
    op.drop_column("demanda_avulsa", "checklist")
    op.drop_column("demanda_avulsa", "comentarios")

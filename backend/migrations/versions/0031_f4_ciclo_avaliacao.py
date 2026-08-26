"""F4 — Módulo B: Infra de Ciclos (janela de tempo compartilhada por 360/180/clima)

Revision ID: 0031_f4_ciclo_avaliacao
Revises: 0030_f4_pdi
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031_f4_ciclo_avaliacao"
down_revision: Union[str, None] = "0030_f4_pdi"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ciclo_avaliacao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tipo", sa.Enum("360", "180", "clima", name="tipo_ciclo_avaliacao_enum"), nullable=False),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("data_inicio", sa.Date(), nullable=False),
        sa.Column("data_fim", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("rascunho", "aberto", "encerrado", name="status_ciclo_avaliacao_enum"),
            nullable=False,
            server_default="rascunho",
        ),
        sa.Column("criado_por_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("aberto_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("encerrado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_ciclo_avaliacao_tipo", "ciclo_avaliacao", ["tipo"])


def downgrade() -> None:
    op.drop_index("ix_ciclo_avaliacao_tipo", table_name="ciclo_avaliacao")
    op.drop_table("ciclo_avaliacao")
    op.execute("DROP TYPE IF EXISTS status_ciclo_avaliacao_enum")
    op.execute("DROP TYPE IF EXISTS tipo_ciclo_avaliacao_enum")

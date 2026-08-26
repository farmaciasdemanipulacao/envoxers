"""F4 — Módulo D: Avaliação 180° (mão dupla gestor<->liderado, via gestor_responsavel_id)

Revision ID: 0033_f4_avaliacao_180
Revises: 0032_f4_avaliacao_360
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0033_f4_avaliacao_180"
down_revision: Union[str, None] = "0032_f4_avaliacao_360"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "avaliacao_180",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ciclo_id", sa.BigInteger(), sa.ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("avaliador_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("avaliado_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direcao", sa.Enum("gestor_para_liderado", "liderado_para_gestor", name="direcao_avaliacao_180_enum"), nullable=False),
        sa.Column("nota_geral", sa.Integer(), nullable=True),
        sa.Column("pontos_fortes", sa.Text(), nullable=True),
        sa.Column("pontos_melhoria", sa.Text(), nullable=True),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pendente", "enviada", name="status_avaliacao_180_enum"),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column("enviada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ciclo_id", "avaliador_id", "avaliado_id", name="uq_avaliacao_180_par"),
    )
    op.create_index("ix_avaliacao_180_ciclo_id", "avaliacao_180", ["ciclo_id"])
    op.create_index("ix_avaliacao_180_avaliado_id", "avaliacao_180", ["avaliado_id"])
    op.create_index("ix_avaliacao_180_avaliador_id", "avaliacao_180", ["avaliador_id"])


def downgrade() -> None:
    op.drop_index("ix_avaliacao_180_avaliador_id", table_name="avaliacao_180")
    op.drop_index("ix_avaliacao_180_avaliado_id", table_name="avaliacao_180")
    op.drop_index("ix_avaliacao_180_ciclo_id", table_name="avaliacao_180")
    op.drop_table("avaliacao_180")
    op.execute("DROP TYPE IF EXISTS status_avaliacao_180_enum")
    op.execute("DROP TYPE IF EXISTS direcao_avaliacao_180_enum")

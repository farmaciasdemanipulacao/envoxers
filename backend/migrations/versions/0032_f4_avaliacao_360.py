"""F4 — Módulo C: Feedback 360° (catálogo de competências + avaliação N×N)

Revision ID: 0032_f4_avaliacao_360
Revises: 0031_f4_ciclo_avaliacao
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0032_f4_avaliacao_360"
down_revision: Union[str, None] = "0031_f4_ciclo_avaliacao"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "competencia_catalogo",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
    )

    op.create_table(
        "avaliacao_360",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ciclo_id", sa.BigInteger(), sa.ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("avaliador_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("avaliado_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        # {competencia_id: nota 1-5}
        sa.Column("respostas", JSONB, nullable=False, server_default="{}"),
        sa.Column("comentario", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("pendente", "enviada", name="status_avaliacao_360_enum"),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column("enviada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ciclo_id", "avaliador_id", "avaliado_id", name="uq_avaliacao_360_par"),
    )
    op.create_index("ix_avaliacao_360_ciclo_id", "avaliacao_360", ["ciclo_id"])
    op.create_index("ix_avaliacao_360_avaliado_id", "avaliacao_360", ["avaliado_id"])
    op.create_index("ix_avaliacao_360_avaliador_id", "avaliacao_360", ["avaliador_id"])


def downgrade() -> None:
    op.drop_index("ix_avaliacao_360_avaliador_id", table_name="avaliacao_360")
    op.drop_index("ix_avaliacao_360_avaliado_id", table_name="avaliacao_360")
    op.drop_index("ix_avaliacao_360_ciclo_id", table_name="avaliacao_360")
    op.drop_table("avaliacao_360")
    op.execute("DROP TYPE IF EXISTS status_avaliacao_360_enum")
    op.drop_table("competencia_catalogo")

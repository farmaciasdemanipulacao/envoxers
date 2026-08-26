"""F4 — Módulo A: PDI (Plano de Desenvolvimento Individual)

Núcleo do F4 — os outros módulos (360/180/1:1) vão gerar ações aqui via
origem_tipo/origem_id (sem FK real, é polimórfico: aponta pra avaliacao_360,
avaliacao_180 ou feedback_1a1 dependendo do tipo).

Revision ID: 0030_f4_pdi
Revises: 0029_gestor_responsavel
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0030_f4_pdi"
down_revision: Union[str, None] = "0029_gestor_responsavel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pdi_acao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("categoria", sa.String(80), nullable=True),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("planejada", "em_andamento", "concluida", "cancelada", name="status_pdi_acao_enum"),
            nullable=False,
            server_default="planejada",
        ),
        sa.Column("origem_tipo", sa.String(20), nullable=True),
        sa.Column("origem_id", sa.BigInteger(), nullable=True),
        sa.Column("criado_por_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pdi_acao_envoxer_id", "pdi_acao", ["envoxer_id"])

    op.create_table(
        "pdi_acao_comentario",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("pdi_acao_id", sa.BigInteger(), sa.ForeignKey("pdi_acao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("autor_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pdi_acao_comentario_pdi_acao_id", "pdi_acao_comentario", ["pdi_acao_id"])


def downgrade() -> None:
    op.drop_index("ix_pdi_acao_comentario_pdi_acao_id", table_name="pdi_acao_comentario")
    op.drop_table("pdi_acao_comentario")
    op.drop_index("ix_pdi_acao_envoxer_id", table_name="pdi_acao")
    op.drop_table("pdi_acao")
    op.execute("DROP TYPE IF EXISTS status_pdi_acao_enum")

"""F4 — Módulo F: Pesquisa de Clima Organizacional (híbrida — vínculo no banco, nunca exposto pra gestor)

Revision ID: 0035_f4_clima
Revises: 0034_f4_feedback_1a1
Create Date: 2026-08-24
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0035_f4_clima"
down_revision: Union[str, None] = "0034_f4_feedback_1a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pergunta_clima",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ciclo_id", sa.BigInteger(), sa.ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("texto", sa.String(300), nullable=False),
        sa.Column("tipo", sa.Enum("likert", "aberta", name="tipo_pergunta_clima_enum"), nullable=False, server_default="likert"),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_pergunta_clima_ciclo_id", "pergunta_clima", ["ciclo_id"])

    op.create_table(
        "resposta_clima",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("ciclo_id", sa.BigInteger(), sa.ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False),
        # Guarda o vínculo (não é anônimo de fato) — decisão híbrida do Gus (D-121):
        # nunca exposto individualmente pra gestor, só admin tem rota de auditoria.
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        # {pergunta_id: valor} — valor é int 1-5 (likert) ou string (aberta)
        sa.Column("respostas", JSONB, nullable=False, server_default="{}"),
        sa.Column("enviada_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ciclo_id", "envoxer_id", name="uq_resposta_clima_par"),
    )
    op.create_index("ix_resposta_clima_ciclo_id", "resposta_clima", ["ciclo_id"])


def downgrade() -> None:
    op.drop_index("ix_resposta_clima_ciclo_id", table_name="resposta_clima")
    op.drop_table("resposta_clima")
    op.drop_index("ix_pergunta_clima_ciclo_id", table_name="pergunta_clima")
    op.drop_table("pergunta_clima")
    op.execute("DROP TYPE IF EXISTS tipo_pergunta_clima_enum")

"""Jornada PDI guiada, ações vinculadas e diagnóstico evolutivo.

Revision ID: 0055
Revises: 0054
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0055"
down_revision = "0054"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("pdi_acao", sa.Column("jornada_id", sa.BigInteger(), nullable=True))
    op.add_column("pdi_acao", sa.Column("como_fazer", sa.Text(), nullable=True))
    op.add_column("pdi_acao", sa.Column("criterio_sucesso", sa.Text(), nullable=True))
    op.add_column("pdi_acao", sa.Column("evidencia_esperada", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_pdi_acao_jornada",
        "pdi_acao",
        "pdi_jornada",
        ["jornada_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_pdi_acao_jornada", "pdi_acao", ["jornada_id"])

    # Consolida automaticamente as ações criadas dentro do período da jornada.
    # Ações anteriores ao ciclo permanecem como histórico e serão exibidas no novo PDI.
    op.execute("""
        UPDATE pdi_acao a
        SET jornada_id = j.id
        FROM pdi_jornada j
        WHERE a.jornada_id IS NULL
          AND a.envoxer_id = j.envoxer_id
          AND a.created_at::date >= j.inicio
          AND a.created_at::date <= j.fim
          AND j.id = (
            SELECT j2.id
            FROM pdi_jornada j2
            WHERE j2.envoxer_id = a.envoxer_id
              AND a.created_at::date >= j2.inicio
              AND a.created_at::date <= j2.fim
            ORDER BY j2.inicio DESC, j2.id DESC
            LIMIT 1
          )
    """)

    op.create_table(
        "pdi_diagnostico",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("jornada_id", sa.BigInteger(), sa.ForeignKey("pdi_jornada.id", ondelete="CASCADE"), nullable=False),
        sa.Column("autor_id", sa.BigInteger(), sa.ForeignKey("envoxer.id"), nullable=False),
        sa.Column("momento", sa.String(20), nullable=False),
        sa.Column("respostas", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("reflexao", sa.Text(), nullable=True),
        sa.Column("conquistas", sa.Text(), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("jornada_id", "momento", name="uq_pdi_diagnostico_jornada_momento"),
    )
    op.create_index("ix_pdi_diagnostico_jornada", "pdi_diagnostico", ["jornada_id", "criado_em"])


def downgrade():
    op.drop_index("ix_pdi_diagnostico_jornada", table_name="pdi_diagnostico")
    op.drop_table("pdi_diagnostico")
    op.drop_index("ix_pdi_acao_jornada", table_name="pdi_acao")
    op.drop_constraint("fk_pdi_acao_jornada", "pdi_acao", type_="foreignkey")
    op.drop_column("pdi_acao", "evidencia_esperada")
    op.drop_column("pdi_acao", "criterio_sucesso")
    op.drop_column("pdi_acao", "como_fazer")
    op.drop_column("pdi_acao", "jornada_id")

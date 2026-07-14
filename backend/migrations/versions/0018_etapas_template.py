"""Etapas-modelo por Serviço — "receita" de processo reaproveitável, aplicada nas Tarefas

Revision ID: 0018_etapas_template
Revises: 0017_etapas_processo
Create Date: 2026-07-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0018_etapas_template"
down_revision: Union[str, None] = "0017_etapas_processo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "etapa_template",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("servico_id", sa.BigInteger, sa.ForeignKey("servico.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("prazo_dias", sa.Integer, nullable=True),
        sa.Column("ordem", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_etapa_template_servico_id", "etapa_template", ["servico_id"])

    op.create_table(
        "automacao_etapa_template",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "etapa_template_id",
            sa.BigInteger,
            sa.ForeignKey("etapa_template.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "acao",
            sa.Enum(
                "LIBERAR_PROXIMA_ETAPA",
                "MOVER_TAREFA_COLUNA",
                "MARCAR_TAREFA_CONCLUIDA",
                "CRIAR_ALERTA_RESPONSAVEL",
                name="acao_automacao_etapa_template_enum",
            ),
            nullable=False,
        ),
        sa.Column("coluna_destino", sa.String(30), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("automacao_etapa_template")
    op.drop_table("etapa_template")
    op.execute("DROP TYPE IF EXISTS acao_automacao_etapa_template_enum")

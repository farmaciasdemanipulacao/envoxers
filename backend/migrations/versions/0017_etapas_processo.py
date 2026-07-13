"""Etapas do processo (checklist estruturado da Tarefa) + automação simples + Pendências

Revision ID: 0017_etapas_processo
Revises: 0016_alerta_config
Create Date: 2026-07-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0017_etapas_processo"
down_revision: Union[str, None] = "0016_alerta_config"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "etapa",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tarefa_id", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("responsavel_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo", sa.Date, nullable=True),
        sa.Column("ordem", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "status",
            sa.Enum("pendente", "concluida", name="status_etapa_enum"),
            nullable=False,
            server_default="pendente",
        ),
        sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_etapa_tarefa_id", "etapa", ["tarefa_id"])

    op.create_table(
        "automacao_etapa",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("etapa_id", sa.BigInteger, sa.ForeignKey("etapa.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column(
            "acao",
            sa.Enum(
                "LIBERAR_PROXIMA_ETAPA",
                "MOVER_TAREFA_COLUNA",
                "MARCAR_TAREFA_CONCLUIDA",
                "CRIAR_ALERTA_RESPONSAVEL",
                name="acao_automacao_etapa_enum",
            ),
            nullable=False,
        ),
        sa.Column("coluna_destino", sa.String(30), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "pendencia",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tarefa_id", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("etapa_id", sa.BigInteger, sa.ForeignKey("etapa.id", ondelete="CASCADE"), nullable=True),
        sa.Column("mensagem", sa.Text, nullable=False),
        sa.Column("lida", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pendencia_envoxer_id", "pendencia", ["envoxer_id"])


def downgrade() -> None:
    op.drop_table("pendencia")
    op.drop_table("automacao_etapa")
    op.drop_table("etapa")
    op.execute("DROP TYPE IF EXISTS acao_automacao_etapa_enum")
    op.execute("DROP TYPE IF EXISTS status_etapa_enum")

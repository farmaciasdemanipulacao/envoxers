"""F2 — Módulo 1: aprovacao, alteracao + colunas novas em tarefa

Revision ID: 0006_f2_aprovacoes
Revises: 0005_foco_comentario
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_f2_aprovacoes"
down_revision: Union[str, None] = "0005_foco_comentario"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

etapa_aprovacao_enum = sa.Enum("interna", "cliente", name="etapa_aprovacao_enum")
decisao_aprovacao_enum = sa.Enum("aprovada", "pediu_ajuste", name="decisao_aprovacao_enum")
status_alteracao_enum = sa.Enum("pendente", "em_execucao", "feita", "descartada", name="status_alteracao_enum")


def upgrade() -> None:
    op.add_column("tarefa", sa.Column("qtd_alteracoes", sa.Integer, nullable=False, server_default="0"))
    op.add_column("tarefa", sa.Column("aprovada_interna", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("tarefa", sa.Column("aprovada_cliente", sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column("tarefa", sa.Column("finalizada_em", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "aprovacao",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tarefa_id", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("etapa", etapa_aprovacao_enum, nullable=False),
        sa.Column("decisao", decisao_aprovacao_enum, nullable=False),
        sa.Column("decidido_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decidido_por_cliente_nome", sa.String(120), nullable=True),
        sa.Column("comentario", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_aprovacao_tarefa", "aprovacao", ["tarefa_id", "created_at"])

    op.create_table(
        "alteracao",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tarefa_id", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero", sa.Integer, nullable=False),
        sa.Column("descricao", sa.Text, nullable=False),
        sa.Column("solicitante_cliente_nome", sa.String(120), nullable=True),
        sa.Column("status", status_alteracao_enum, nullable=False, server_default="pendente"),
        sa.Column("atendida_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tarefa_id", "numero", name="uq_alteracao_tarefa_numero"),
    )
    op.create_index("idx_alteracao_tarefa", "alteracao", ["tarefa_id"])


def downgrade() -> None:
    op.drop_table("alteracao")
    op.drop_table("aprovacao")
    op.drop_column("tarefa", "finalizada_em")
    op.drop_column("tarefa", "aprovada_cliente")
    op.drop_column("tarefa", "aprovada_interna")
    op.drop_column("tarefa", "qtd_alteracoes")
    status_alteracao_enum.drop(op.get_bind(), checkfirst=True)
    decisao_aprovacao_enum.drop(op.get_bind(), checkfirst=True)
    etapa_aprovacao_enum.drop(op.get_bind(), checkfirst=True)

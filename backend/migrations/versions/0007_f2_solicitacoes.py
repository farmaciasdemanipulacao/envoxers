"""F2 — Módulo 2: solicitacao (inbox de pedidos do cliente)

Revision ID: 0007_f2_solicitacoes
Revises: 0006_f2_aprovacoes
Create Date: 2026-07-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0007_f2_solicitacoes"
down_revision: Union[str, None] = "0006_f2_aprovacoes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

tipo_solicitacao_enum = sa.Enum(
    "novo_post", "alteracao", "material_extra", "campanha", "evento", name="tipo_solicitacao_enum"
)
status_solicitacao_enum = sa.Enum(
    "nova", "em_analise", "virou_demanda", "recusada", name="status_solicitacao_enum"
)


def upgrade() -> None:
    op.create_table(
        "solicitacao",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", tipo_solicitacao_enum, nullable=False),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("anexos", JSONB, nullable=False, server_default="[]"),
        sa.Column("status", status_solicitacao_enum, nullable=False, server_default="nova"),
        sa.Column("motivo_recusa", sa.String(300), nullable=True),
        sa.Column("tarefa_id_gerada", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="SET NULL"), nullable=True),
        sa.Column("solicitante_nome", sa.String(120), nullable=True),
        sa.Column("atendido_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("respondido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_solicitacao_cliente", "solicitacao", ["cliente_id", "status"])
    op.create_index("idx_solicitacao_status", "solicitacao", ["status", "created_at"])


def downgrade() -> None:
    op.drop_table("solicitacao")
    status_solicitacao_enum.drop(op.get_bind(), checkfirst=True)
    tipo_solicitacao_enum.drop(op.get_bind(), checkfirst=True)

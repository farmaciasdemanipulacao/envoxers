"""Campanhas como entidade própria + vínculo opcional em Tarefa.

Revision ID: 0036_campanhas
Revises: 0035_f4_clima
Create Date: 2026-08-26
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0036_campanhas"
down_revision: Union[str, None] = "0035_f4_clima"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campanha",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(180), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("status", sa.String(30), nullable=False, server_default="ativa"),
        sa.Column("data_inicio", sa.Date(), nullable=True),
        sa.Column("data_fim", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_campanha_cliente_id", "campanha", ["cliente_id"])
    op.add_column("tarefa", sa.Column("campanha_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key("fk_tarefa_campanha_id", "tarefa", "campanha", ["campanha_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_tarefa_campanha_id", "tarefa", ["campanha_id"])


def downgrade() -> None:
    op.drop_index("ix_tarefa_campanha_id", table_name="tarefa")
    op.drop_constraint("fk_tarefa_campanha_id", "tarefa", type_="foreignkey")
    op.drop_column("tarefa", "campanha_id")
    op.drop_index("ix_campanha_cliente_id", table_name="campanha")
    op.drop_table("campanha")

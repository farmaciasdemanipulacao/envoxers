"""Portal do Cliente — Módulo A: ClienteContato (login de contatos do cliente)

Revision ID: 0019_cliente_contato
Revises: 0018_etapas_template
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0019_cliente_contato"
down_revision: Union[str, None] = "0018_etapas_template"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "cliente_contato",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(length=160), nullable=False),
        sa.Column("cargo", sa.String(length=80), nullable=True),
        sa.Column("email", sa.String(length=160), nullable=False, unique=True),
        sa.Column("senha_hash", sa.String(length=255), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("criado_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("set_senha_token", sa.String(length=120), nullable=True, unique=True),
        sa.Column("set_senha_token_expira", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_cliente_contato_cliente_id", "cliente_contato", ["cliente_id"])


def downgrade() -> None:
    op.drop_index("ix_cliente_contato_cliente_id", table_name="cliente_contato")
    op.drop_table("cliente_contato")

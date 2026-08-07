"""Impersonação — admin acessa a conta de outro envoxer sem senha ("Acessar como")

Cria impersonacao_log só de auditoria (quem, quem foi acessado, quando, IP) —
sem UI própria ainda, o token de impersonação carrega o claim `imp_by` (JWT,
não precisa de coluna no banco).

Revision ID: 0026_impersonacao_log
Revises: 0025_card_auto_fill
Create Date: 2026-08-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0026_impersonacao_log"
down_revision: Union[str, None] = "0025_card_auto_fill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "impersonacao_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("admin_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
    )
    op.create_index("ix_impersonacao_log_admin_id", "impersonacao_log", ["admin_id"])
    op.create_index("ix_impersonacao_log_envoxer_id", "impersonacao_log", ["envoxer_id"])


def downgrade() -> None:
    op.drop_index("ix_impersonacao_log_envoxer_id", table_name="impersonacao_log")
    op.drop_index("ix_impersonacao_log_admin_id", table_name="impersonacao_log")
    op.drop_table("impersonacao_log")

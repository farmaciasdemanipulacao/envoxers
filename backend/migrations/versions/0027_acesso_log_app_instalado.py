"""Onboarding obrigatório (D-114) — histórico de acessos + status de instalação do app

Cria acesso_log (1 linha por login bem-sucedido, independente do timer de Foco) e
adiciona app_instalado/app_instalado_em em envoxer (marcado quando o frontend
detecta a app rodando em display-mode:standalone pela 1ª vez).

Revision ID: 0027_acesso_log_app_instalado
Revises: 0026_impersonacao_log
Create Date: 2026-08-09
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0027_acesso_log_app_instal"
down_revision: Union[str, None] = "0026_impersonacao_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "acesso_log",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
    )
    op.create_index("ix_acesso_log_envoxer_id", "acesso_log", ["envoxer_id"])
    op.create_index("ix_acesso_log_criado_em", "acesso_log", ["criado_em"])

    op.add_column("envoxer", sa.Column("app_instalado", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("envoxer", sa.Column("app_instalado_em", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("envoxer", "app_instalado_em")
    op.drop_column("envoxer", "app_instalado")

    op.drop_index("ix_acesso_log_criado_em", table_name="acesso_log")
    op.drop_index("ix_acesso_log_envoxer_id", table_name="acesso_log")
    op.drop_table("acesso_log")

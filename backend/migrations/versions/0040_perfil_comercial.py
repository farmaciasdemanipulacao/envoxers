"""Adiciona o perfil de acesso Comercial.

Revision ID: 0040_perfil_comercial
Revises: 0039_comercial_integracoes
Create Date: 2026-09-10
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0040_perfil_comercial"
down_revision: Union[str, None] = "0039_comercial_integracoes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ADD VALUE precisa ficar fora da transação para funcionar de forma
    # consistente nas versões de PostgreSQL suportadas pelo projeto.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE permissao_enum ADD VALUE IF NOT EXISTS 'comercial'")


def downgrade() -> None:
    # PostgreSQL não oferece DROP VALUE seguro para ENUM. Remover exigiria recriar
    # o tipo e converter a coluna, o que é destrutivo; downgrade intencionalmente no-op.
    pass

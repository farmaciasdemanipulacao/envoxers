"""Edição e exclusão para todos no Chat.

Revision ID: 0041_chat_edit_delete
Revises: 0040_perfil_comercial
Create Date: 2026-09-28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0041_chat_edit_delete"
down_revision: Union[str, None] = "0040_perfil_comercial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_mensagem", sa.Column("editado_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("chat_mensagem", sa.Column("excluida_para_todos_em", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_mensagem", "excluida_para_todos_em")
    op.drop_column("chat_mensagem", "editado_em")

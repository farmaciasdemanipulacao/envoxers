"""Vínculo Kanban ↔ Item de Escopo — provisionamento automático de cards

Adiciona `ano_mes`/`slot`/`retirado_sem_reposicao` em `tarefa`, usados pelo
provisionamento automático de cards a partir da cota contratada (Item de
Escopo). `ano_mes`+`slot` identificam a qual "vaga" de cota um card conta
(mesmo padrão de nome já usado em `entrega_manual.ano_mes`/`alerta_entrega.ano_mes`),
independente de `created_at`/`finalizada_em`. Índice único parcial (só linhas
vivas) evita duplicar o mesmo slot sob concorrência (dois `GET /tarefas`
simultâneos não devem gerar 2 cards pro mesmo slot).

Revision ID: 0022_tarefa_provisionamento
Revises: 0021_documento_acordo
Create Date: 2026-07-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0022_tarefa_provisionamento"
down_revision: Union[str, None] = "0021_documento_acordo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tarefa", sa.Column("ano_mes", sa.String(length=7), nullable=True))
    op.add_column("tarefa", sa.Column("slot", sa.Integer(), nullable=True))
    op.add_column("tarefa", sa.Column("retirado_sem_reposicao", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_index(
        "ix_tarefa_item_escopo_ano_mes_slot",
        "tarefa",
        ["item_escopo_id", "ano_mes", "slot"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_tarefa_item_escopo_ano_mes_slot", table_name="tarefa")
    op.drop_column("tarefa", "retirado_sem_reposicao")
    op.drop_column("tarefa", "slot")
    op.drop_column("tarefa", "ano_mes")

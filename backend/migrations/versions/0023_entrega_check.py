"""Redesenho: 1 card por Item de Escopo/mês, com checklist de entregas dentro

A primeira versão (migration 0022) criava 1 card do Kanban por UNIDADE
contratada (slot). Correção: passa a ser 1 card por (item_escopo_id, ano_mes),
com uma unidade contratada = 1 linha em `entrega_check` dentro desse card.
Remove `tarefa.slot`/`tarefa.retirado_sem_reposicao` (conceito de slot não
existe mais) e o índice único por slot, substituindo por um índice único por
(item_escopo_id, ano_mes).

Revision ID: 0023_entrega_check
Revises: 0022_tarefa_provisionamento
Create Date: 2026-07-17
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0023_entrega_check"
down_revision: Union[str, None] = "0022_tarefa_provisionamento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Limpeza: a migration 0022 já provisionou cards no modelo antigo (1 por
    # unidade/slot). Nenhum teve interação real (todos "nova", sem comentário/
    # anexo/responsável — confirmado antes de escrever esta migration) — remove
    # pra não violar o novo índice único (item_escopo_id, ano_mes), que agora
    # é 1 card só por ciclo.
    op.execute("DELETE FROM tarefa WHERE ano_mes IS NOT NULL")

    op.drop_index("ix_tarefa_item_escopo_ano_mes_slot", table_name="tarefa")
    op.drop_column("tarefa", "retirado_sem_reposicao")
    op.drop_column("tarefa", "slot")

    op.create_index(
        "ix_tarefa_item_escopo_ano_mes",
        "tarefa",
        ["item_escopo_id", "ano_mes"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "entrega_check",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("tarefa_id", sa.BigInteger(), sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("entregue", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("entregue_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entregue_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("excedente", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entrega_check_tarefa_numero", "entrega_check", ["tarefa_id", "numero"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_entrega_check_tarefa_numero", table_name="entrega_check")
    op.drop_table("entrega_check")
    op.drop_index("ix_tarefa_item_escopo_ano_mes", table_name="tarefa")
    op.add_column("tarefa", sa.Column("slot", sa.Integer(), nullable=True))
    op.add_column("tarefa", sa.Column("retirado_sem_reposicao", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_index(
        "ix_tarefa_item_escopo_ano_mes_slot",
        "tarefa",
        ["item_escopo_id", "ano_mes", "slot"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

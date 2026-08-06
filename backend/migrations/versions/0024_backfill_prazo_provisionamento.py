"""Backfill: prazo (fim do mês) nos cards de cota já provisionados

Migration 0022/0023 nunca setava `tarefa.prazo` nos cards automáticos
(item_escopo_id+ano_mes) — o campo `services/provisionamento.py` passou a
preencher agora ficava com `prazo=None`, e sem prazo o card nunca cai nos
filtros de "atrasada" (Kanban/Dashboard), mesmo parado há meses com o
checklist zerado. Backfill determinístico: último dia do mês do próprio
`ano_mes` já gravado na linha. Só toca cards de cota mensal (ano_mes != 'pontual')
sem prazo ainda definido — nunca sobrescreve um prazo que já existia (poderia
ter sido editado manualmente por alguém depois da criação automática).

Revision ID: 0024_prazo_provisionamento
Revises: 0023_entrega_check
Create Date: 2026-08-03
"""
from typing import Sequence, Union
from alembic import op

# Nota: revision ID != prefixo do arquivo — alembic_version.version_num é
# varchar(32) e "0024_backfill_prazo_provisionamento" (35 chars) estourava o
# limite (StringDataRightTruncationError), derrubando a migration inteira.
revision: str = "0024_prazo_provisionamento"
down_revision: Union[str, None] = "0023_entrega_check"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        UPDATE tarefa
        SET prazo = (to_date(ano_mes, 'YYYY-MM') + interval '1 month' - interval '1 day')::date
        WHERE item_escopo_id IS NOT NULL
          AND ano_mes IS NOT NULL
          AND ano_mes <> 'pontual'
          AND prazo IS NULL
    """)


def downgrade() -> None:
    # Backfill de dado, não de schema — não dá pra distinguir com segurança um
    # prazo herdado deste backfill de um editado manualmente depois por alguém.
    # Downgrade intencionalmente não reverte os valores (mesma decisão já usada
    # em migrations de dado anteriores deste projeto).
    pass

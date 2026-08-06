"""Card automático com dado do cliente já preenchido

Pedido do Gus: o card gerado automaticamente a partir da cota contratada
(Item de Escopo) precisa nascer com Serviço, Responsável e o checklist de
Etapas já preenchidos, puxando do que foi cadastrado em Serviços — sem
retrabalho manual. Pra isso:
- `item_escopo.servico_id` liga o item ao catálogo de Serviços (antes só
  existia um texto livre `tipo`, sem vínculo nenhum com a tabela Serviço —
  o card nunca conseguia saber que Serviço usar).
- `etapa_template.responsavel_padrao_envoxer_id` guarda quem executa cada
  etapa do processo por padrão (ex.: "criar legenda" -> Kaory, "publicar"
  -> Karina) — copiado pra `Etapa.responsavel_id` sempre que o processo é
  aplicado numa Tarefa.
- `tarefa.tipo_tarefa`/`criativo`/`legenda` removidos — "tipo de tarefa"
  vira redundante (unificado em Serviço) e "Criativo"/"Legenda" saíram do
  card por decisão do Gus.

Revision ID: 0025_card_auto_fill
Revises: 0024_prazo_provisionamento
Create Date: 2026-08-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025_card_auto_fill"
down_revision: Union[str, None] = "0024_prazo_provisionamento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "etapa_template",
        sa.Column(
            "responsavel_padrao_envoxer_id", sa.BigInteger(),
            sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True,
        ),
    )
    op.add_column(
        "item_escopo",
        sa.Column("servico_id", sa.BigInteger(), sa.ForeignKey("servico.id", ondelete="SET NULL"), nullable=True),
    )

    op.drop_column("tarefa", "tipo_tarefa")
    op.drop_column("tarefa", "criativo")
    op.drop_column("tarefa", "legenda")


def downgrade() -> None:
    op.add_column("tarefa", sa.Column("legenda", sa.Text(), nullable=True))
    op.add_column("tarefa", sa.Column("criativo", sa.String(500), nullable=True))
    op.add_column("tarefa", sa.Column("tipo_tarefa", sa.String(60), nullable=True))

    op.drop_column("item_escopo", "servico_id")
    op.drop_column("etapa_template", "responsavel_padrao_envoxer_id")

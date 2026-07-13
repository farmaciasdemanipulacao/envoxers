"""Catálogo de tipos de alerta configuráveis pelo admin — tabela alerta_config

Revision ID: 0016_alerta_config
Revises: 0015_push_subscription
Create Date: 2026-07-13
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0016_alerta_config"
down_revision: Union[str, None] = "0015_push_subscription"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Seed alinhado ao comportamento hardcoded atual: farol_geral e chat_dm ativos
# (igual já era antes desta migration); os 7 sinais individuais nascem
# desativados — são granularidade NOVA, opt-in, pra não duplicar notificação
# do mesmo evento (farol geral + sinal individual disparando juntos).
_SEED = [
    ("farol_geral", "Farol piorou (geral)", "farol", "Dispara quando a cor geral do Farol de um cliente piora.", True, ["admin", "gestor"]),
    ("farol_sinal_entrega", "Sinal: Entrega no prazo", "farol", "Dispara quando o sinal de entrega piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_atrasadas", "Sinal: Tarefas atrasadas", "farol", "Dispara quando o sinal de atrasadas piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_alteracoes", "Sinal: Alterações acima do limite", "farol", "Dispara quando o sinal de alterações piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_aprovacoes", "Sinal: Aprovações paradas", "farol", "Dispara quando o sinal de aprovações piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_pulso", "Sinal: Pulso de satisfação", "farol", "Dispara quando o sinal de pulso piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_margem", "Sinal: Margem", "farol", "Dispara quando o sinal de margem piora, isoladamente.", False, ["admin", "gestor"]),
    ("farol_sinal_silencio", "Sinal: Silêncio do cliente", "farol", "Dispara quando o sinal de silêncio piora, isoladamente.", False, ["admin", "gestor"]),
    ("chat_dm", "Mensagem direta no chat", "chat", "Dispara quando alguém manda uma DM pra um envoxer que não está com a aba visível.", True, None),
]

_alerta_config = sa.table(
    "alerta_config",
    sa.column("chave", sa.String),
    sa.column("nome", sa.String),
    sa.column("grupo", sa.String),
    sa.column("descricao", sa.Text),
    sa.column("ativo", sa.Boolean),
    sa.column("papeis", postgresql.JSONB),
)


def upgrade() -> None:
    op.create_table(
        "alerta_config",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("chave", sa.String(60), nullable=False, unique=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("grupo", sa.String(30), nullable=False),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("papeis", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.bulk_insert(
        _alerta_config,
        [
            {"chave": chave, "nome": nome, "grupo": grupo, "descricao": descricao, "ativo": ativo, "papeis": papeis}
            for chave, nome, grupo, descricao, ativo, papeis in _SEED
        ],
    )


def downgrade() -> None:
    op.drop_table("alerta_config")

"""F2 — Módulo 4 (final): farol_calculo, farol_calculo_historico, alerta_farol

Revision ID: 0009_f2_farol_alertas
Revises: 0008_f2_pulso_checkin
Create Date: 2026-07-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0009_f2_farol_alertas"
down_revision: Union[str, None] = "0008_f2_pulso_checkin"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

farol_cor_enum = sa.Enum("verde", "amarelo", "vermelho", name="farol_cor_enum")
farol_cor_sem_dado_enum = sa.Enum("verde", "amarelo", "vermelho", "sem_dado", name="farol_cor_sem_dado_enum")
status_alerta_enum = sa.Enum("aberto", "reconhecido", "resolvido", "ignorado", name="status_alerta_enum")

# Usado em múltiplas colunas/tabelas na mesma migration — criar o tipo uma única vez
# explicitamente e referenciar com create_type=False nas colunas evita DuplicateObjectError.
_farol_cor = postgresql.ENUM("verde", "amarelo", "vermelho", name="farol_cor_enum", create_type=False)
_farol_cor_sem_dado = postgresql.ENUM(
    "verde", "amarelo", "vermelho", "sem_dado", name="farol_cor_sem_dado_enum", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    # farol_cor_enum e farol_cor_sem_dado_enum são reusados em várias colunas/tabelas
    # nesta mesma migration — criar o tipo uma única vez aqui e referenciar com
    # create_type=False nas colunas evita DuplicateObjectError. status_alerta_enum é
    # usado numa única coluna, então cria via create_type=True normal (default do Enum).
    farol_cor_enum.create(bind, checkfirst=True)
    farol_cor_sem_dado_enum.create(bind, checkfirst=True)

    op.create_table(
        "farol_calculo",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("calculado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("farol", _farol_cor, nullable=False),
        sa.Column("health_score", sa.SmallInteger, nullable=False),
        sa.Column("sinal_entrega", _farol_cor, nullable=False),
        sa.Column("sinal_entrega_valor", sa.String(60), nullable=True),
        sa.Column("sinal_atrasadas", _farol_cor, nullable=False),
        sa.Column("sinal_atrasadas_valor", sa.Integer, nullable=True),
        sa.Column("sinal_alteracoes", _farol_cor, nullable=False),
        sa.Column("sinal_alteracoes_valor", sa.String(60), nullable=True),
        sa.Column("sinal_aprovacoes", _farol_cor, nullable=False),
        sa.Column("sinal_aprovacoes_valor", sa.String(60), nullable=True),
        sa.Column("sinal_pulso", _farol_cor_sem_dado, nullable=False),
        sa.Column("sinal_pulso_valor", sa.SmallInteger, nullable=True),
        sa.Column("sinal_margem", _farol_cor_sem_dado, nullable=False),
        sa.Column("sinal_margem_valor", sa.Numeric(5, 1), nullable=True),
        sa.Column("sinal_silencio", _farol_cor, nullable=False),
        sa.Column("sinal_silencio_valor", sa.Integer, nullable=True),
        sa.Column("sinal_whatsapp", _farol_cor_sem_dado, nullable=False),
        sa.Column("sinal_whatsapp_valor", sa.String(20), nullable=True),
        sa.Column("motivo_json", JSONB, nullable=True),
    )

    op.create_table(
        "farol_calculo_historico",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("calculado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("farol", _farol_cor, nullable=False),
        sa.Column("health_score", sa.SmallInteger, nullable=False),
        sa.Column("motivo_json", JSONB, nullable=True),
    )
    op.create_index("idx_fh_cliente_data", "farol_calculo_historico", ["cliente_id", "calculado_em"])

    op.create_table(
        "alerta_farol",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("farol_de", _farol_cor, nullable=False),
        sa.Column("farol_para", _farol_cor, nullable=False),
        sa.Column("motivo_json", JSONB, nullable=False),
        sa.Column("motivo_texto", sa.Text, nullable=False),
        sa.Column("sugestao_acao", sa.String(300), nullable=True),
        sa.Column("status", status_alerta_enum, nullable=False, server_default="aberto"),
        sa.Column("reconhecido_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reconhecido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolucao_nota", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_alerta_status", "alerta_farol", ["status", "created_at"])
    op.create_index("idx_alerta_cliente", "alerta_farol", ["cliente_id", "status"])


def downgrade() -> None:
    op.drop_table("alerta_farol")
    op.drop_table("farol_calculo_historico")
    op.drop_table("farol_calculo")
    status_alerta_enum.drop(op.get_bind(), checkfirst=True)
    farol_cor_sem_dado_enum.drop(op.get_bind(), checkfirst=True)
    farol_cor_enum.drop(op.get_bind(), checkfirst=True)

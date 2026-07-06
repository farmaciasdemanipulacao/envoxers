"""F3 — Base técnica: perfil_cliente, perfil_cliente_historico

Revision ID: 0011_f3_perfil_cliente
Revises: 0010_registro_foco_descartado
Create Date: 2026-07-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0011_f3_perfil_cliente"
down_revision: Union[str, None] = "0010_registro_foco_descartado"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

perfil_cliente_enum = sa.Enum("facil", "neutro", "dificil", name="perfil_cliente_enum")
_perfil_cliente = postgresql.ENUM("facil", "neutro", "dificil", name="perfil_cliente_enum", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    perfil_cliente_enum.create(bind, checkfirst=True)

    op.create_table(
        "perfil_cliente",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("calculado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("perfil", _perfil_cliente, nullable=False),
        sa.Column("score", sa.SmallInteger, nullable=False),
        sa.Column("velocidade_aprovacao_dias", sa.Numeric(4, 1), nullable=True),
        sa.Column("alteracoes_media_por_tarefa", sa.Numeric(3, 1), nullable=True),
        sa.Column("atrasos_causados_pelo_cliente", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tarefas_avaliadas", sa.Integer, nullable=False, server_default="0"),
    )

    op.create_table(
        "perfil_cliente_historico",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("calculado_em", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("perfil", _perfil_cliente, nullable=False),
        sa.Column("score", sa.SmallInteger, nullable=False),
    )
    op.create_index("idx_pch_cliente_data", "perfil_cliente_historico", ["cliente_id", "calculado_em"])


def downgrade() -> None:
    op.drop_table("perfil_cliente_historico")
    op.drop_table("perfil_cliente")
    perfil_cliente_enum.drop(op.get_bind(), checkfirst=True)

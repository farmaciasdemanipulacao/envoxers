"""F3 — Módulo 1: motivo_churn_catalogo, churn_snapshot

Revision ID: 0012_f3_churn
Revises: 0011_f3_perfil_cliente
Create Date: 2026-07-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0012_f3_churn"
down_revision: Union[str, None] = "0011_f3_perfil_cliente"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

categoria_motivo_churn_enum = sa.Enum(
    "preco", "entrega", "encaixe", "externa", "ativa", "sem_resposta", name="categoria_motivo_churn_enum"
)
perfil_cliente_snap_enum = postgresql.ENUM(
    "facil", "neutro", "dificil", name="perfil_cliente_enum", create_type=False
)
farol_cor_snap_enum = postgresql.ENUM(
    "verde", "amarelo", "vermelho", name="farol_cor_enum", create_type=False
)


def upgrade() -> None:
    # categoria_motivo_churn_enum é usado numa única coluna — deixa o create_table criar
    # o tipo sozinho (create_type=True default do Enum), sem pré-criar explicitamente
    # (criar antes causa DuplicateObjectError, ver lição do D-040 em [[project_envoxers]]).
    op.create_table(
        "motivo_churn_catalogo",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("codigo", sa.String(40), nullable=False, unique=True),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("categoria", categoria_motivo_churn_enum, nullable=False),
        sa.Column("ordem", sa.Integer, nullable=False, server_default="0"),
    )

    op.create_table(
        "churn_snapshot",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("data_cancelamento", sa.Date, nullable=False),
        sa.Column("meses_de_casa", sa.Integer, nullable=False),
        sa.Column("motivo_codigo", sa.String(40), sa.ForeignKey("motivo_churn_catalogo.codigo", ondelete="RESTRICT"), nullable=False),
        sa.Column("motivo_detalhe", sa.Text, nullable=True),
        sa.Column("quem_registrou_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_nome_snap", sa.String(160), nullable=False),
        sa.Column("segmento_snap", sa.String(80), nullable=True),
        sa.Column("ticket_snap", sa.Numeric(12, 2), nullable=True),
        sa.Column("canal_aquisicao_snap", sa.String(40), nullable=True),
        sa.Column("maturidade_snap", sa.String(20), nullable=True),
        sa.Column("perfil_snap", perfil_cliente_snap_enum, nullable=True),
        sa.Column("valor_contrato_snap", sa.Numeric(12, 2), nullable=False),
        sa.Column("tipo_receita_snap", sa.String(20), nullable=False),
        sa.Column("margem_media_snap", sa.Numeric(5, 1), nullable=True),
        sa.Column("pulso_medio_snap", sa.Numeric(3, 1), nullable=True),
        sa.Column("farol_ultimo_snap", farol_cor_snap_enum, nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_churn_data", "churn_snapshot", ["data_cancelamento"])
    op.create_index("idx_churn_meses", "churn_snapshot", ["meses_de_casa"])
    op.create_index("idx_churn_motivo", "churn_snapshot", ["motivo_codigo"])


def downgrade() -> None:
    op.drop_table("churn_snapshot")
    op.drop_table("motivo_churn_catalogo")
    categoria_motivo_churn_enum.drop(op.get_bind(), checkfirst=True)

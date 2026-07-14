"""Portal do Cliente — Módulo C: Documento de Aditivo/Acordo

Cria documento_acordo/documento_confirmacao e adiciona a FK de
item_escopo_historico.documento_acordo_id (coluna já existia desde a
migration 0020, sem constraint, porque a tabela ainda não existia).

Revision ID: 0021_documento_acordo
Revises: 0020_item_escopo
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0021_documento_acordo"
down_revision: Union[str, None] = "0020_item_escopo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "documento_acordo",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=40), nullable=False, server_default="aditivo_escopo"),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("itens_alterados", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("status", sa.Enum("aguardando_confirmacoes", "vigente", "cancelado", name="status_documento_acordo_enum"), nullable=False, server_default="aguardando_confirmacoes"),
        sa.Column("criado_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vigente_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_documento_acordo_cliente_id", "documento_acordo", ["cliente_id"])

    op.create_table(
        "documento_confirmacao",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("documento_acordo_id", sa.BigInteger(), sa.ForeignKey("documento_acordo.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo_confirmante", sa.Enum("envoxer", "cliente_contato", name="tipo_confirmante_enum"), nullable=False),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_contato_id", sa.BigInteger(), sa.ForeignKey("cliente_contato.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nome_snapshot", sa.String(length=160), nullable=False),
        sa.Column("email_snapshot", sa.String(length=160), nullable=False),
        sa.Column("confirmado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_documento_confirmacao_documento_id", "documento_confirmacao", ["documento_acordo_id"])

    op.create_foreign_key(
        "fk_item_escopo_historico_documento_acordo",
        "item_escopo_historico", "documento_acordo",
        ["documento_acordo_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_item_escopo_historico_documento_acordo", "item_escopo_historico", type_="foreignkey")
    op.drop_index("ix_documento_confirmacao_documento_id", table_name="documento_confirmacao")
    op.drop_table("documento_confirmacao")
    op.drop_index("ix_documento_acordo_cliente_id", table_name="documento_acordo")
    op.drop_table("documento_acordo")
    op.execute("DROP TYPE IF EXISTS tipo_confirmante_enum")
    op.execute("DROP TYPE IF EXISTS status_documento_acordo_enum")

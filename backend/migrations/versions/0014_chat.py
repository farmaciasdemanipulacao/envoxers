"""Chat interno — canal geral, por cliente e DM 1:1, mensagens e marcação de leitura

Revision ID: 0014_chat
Revises: 0013_evento
Create Date: 2026-07-10
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0014_chat"
down_revision: Union[str, None] = "0013_evento"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Deixa create_table criar o tipo sozinho (create_type=True default do Enum) — ver
# lição do D-040 em [[project_envoxers]]: pré-criar o tipo causa DuplicateObjectError.
tipo_canal_enum = sa.Enum("geral", "cliente", "dm", name="tipo_canal_enum")


def upgrade() -> None:
    op.create_table(
        "chat_canal",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("tipo", tipo_canal_enum, nullable=False),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=True),
        sa.Column("dm_envoxer_a_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=True),
        sa.Column("dm_envoxer_b_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "uq_chat_canal_cliente", "chat_canal", ["cliente_id"], unique=True,
        postgresql_where=sa.text("cliente_id IS NOT NULL"),
    )
    op.create_index(
        "uq_chat_canal_dm", "chat_canal", ["dm_envoxer_a_id", "dm_envoxer_b_id"], unique=True,
        postgresql_where=sa.text("dm_envoxer_a_id IS NOT NULL"),
    )

    op.create_table(
        "chat_mensagem",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("canal_id", sa.BigInteger, sa.ForeignKey("chat_canal.id", ondelete="CASCADE"), nullable=False),
        sa.Column("autor_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("texto", sa.Text, nullable=True),
        sa.Column("anexo_url", sa.String(500), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_chat_mensagem_canal", "chat_mensagem", ["canal_id", "id"])

    op.create_table(
        "chat_leitura",
        sa.Column("envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("canal_id", sa.BigInteger, sa.ForeignKey("chat_canal.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chat_leitura")
    op.drop_table("chat_mensagem")
    op.drop_index("uq_chat_canal_dm", table_name="chat_canal")
    op.drop_index("uq_chat_canal_cliente", table_name="chat_canal")
    op.drop_table("chat_canal")
    tipo_canal_enum.drop(op.get_bind(), checkfirst=True)

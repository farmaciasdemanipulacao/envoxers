"""Calendário — tabela evento (reunião/captação/live/evento_externo/outro)

Revision ID: 0013_evento
Revises: 0012_f3_churn
Create Date: 2026-07-08
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0013_evento"
down_revision: Union[str, None] = "0012_f3_churn"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# tipo_evento_enum é usado numa única coluna — deixa o create_table criar o tipo
# sozinho (create_type=True default do Enum), sem pré-criar explicitamente (ver
# lição do D-040 em [[project_envoxers]]: criar antes causa DuplicateObjectError).
tipo_evento_enum = sa.Enum("reuniao", "captacao", "evento_externo", "live", "outro", name="tipo_evento_enum")


def upgrade() -> None:
    op.create_table(
        "evento",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("tipo", tipo_evento_enum, nullable=False, server_default="reuniao"),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="SET NULL"), nullable=True),
        sa.Column("data_inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("data_fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dia_inteiro", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("local", sa.String(200), nullable=True),
        sa.Column("descricao", sa.Text, nullable=True),
        sa.Column("criado_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_evento_data", "evento", ["data_inicio"])
    op.create_index("idx_evento_cliente", "evento", ["cliente_id"])


def downgrade() -> None:
    op.drop_table("evento")
    tipo_evento_enum.drop(op.get_bind(), checkfirst=True)

"""F1 — tarefa (Kanban) e registro_foco (registro de tempo)

Revision ID: 0003_tarefa_foco
Revises: 0002_envoxer_salario
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0003_tarefa_foco"
down_revision: Union[str, None] = "0002_envoxer_salario"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

status_tarefa_enum = sa.Enum(
    "nova", "planejamento", "producao", "revisao_interna",
    "aprovacao_cliente", "ajustes", "programado", "finalizado",
    name="status_tarefa_enum",
)


def upgrade() -> None:
    op.create_table(
        "tarefa",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("servico_id", sa.BigInteger, sa.ForeignKey("servico.id", ondelete="SET NULL"), nullable=True),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("tipo_tarefa", sa.String(60), nullable=True),
        sa.Column("responsavel_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", status_tarefa_enum, nullable=False, server_default="nova"),
        sa.Column("ordem", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prazo", sa.Date, nullable=True),
        sa.Column("etiqueta", sa.String(40), nullable=True),
        sa.Column("etiqueta_cor", sa.String(20), nullable=True),
        sa.Column("criativo", sa.String(500), nullable=True),
        sa.Column("legenda", sa.Text, nullable=True),
        sa.Column("comentarios", JSONB, nullable=False, server_default="[]"),
        sa.Column("anexos", JSONB, nullable=False, server_default="[]"),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_tarefa_cliente", "tarefa", ["cliente_id"])
    op.create_index("idx_tarefa_status", "tarefa", ["status"])
    op.create_index("idx_tarefa_responsavel", "tarefa", ["responsavel_envoxer_id"])
    op.create_index("idx_tarefa_prazo", "tarefa", ["prazo"])
    op.create_index("idx_tarefa_deleted", "tarefa", ["deleted_at"])

    op.create_table(
        "registro_foco",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tarefa_id", sa.BigInteger, sa.ForeignKey("tarefa.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inicio", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fim", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duracao_min", sa.Integer, nullable=True),
        sa.Column("custo_hora_snapshot", sa.Numeric(10, 2), nullable=True),
        sa.Column("custo", sa.Numeric(10, 2), nullable=True),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_registro_foco_envoxer_inicio", "registro_foco", ["envoxer_id", "inicio"])
    op.create_index("idx_registro_foco_tarefa", "registro_foco", ["tarefa_id"])

    # Só uma sessão ativa (fim IS NULL) por envoxer — garantido no banco, não só na aplicação.
    op.execute(
        "CREATE UNIQUE INDEX uq_registro_foco_ativo ON registro_foco (envoxer_id) WHERE fim IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_registro_foco_ativo")
    op.drop_table("registro_foco")
    op.drop_table("tarefa")
    status_tarefa_enum.drop(op.get_bind(), checkfirst=True)

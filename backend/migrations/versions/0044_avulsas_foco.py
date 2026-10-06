"""Demandas avulsas e fluxo de ajuste/aprovação do Foco.

Revision ID: 0044_avulsas_foco
Revises: 0043_feedback_foco
Create Date: 2026-10-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0044_avulsas_foco"
down_revision: Union[str, None] = "0043_feedback_foco"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "demanda_avulsa",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("contexto", sa.String(length=160), nullable=False),
        sa.Column("titulo", sa.String(length=220), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("responsavel_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo", sa.Date(), nullable=True),
        sa.Column("prioridade", sa.String(length=20), nullable=False, server_default="media"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="nova"),
        sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("tenant_id", sa.BigInteger(), nullable=True, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_demanda_avulsa_responsavel", "demanda_avulsa", ["responsavel_envoxer_id"], unique=False)
    op.create_index("ix_demanda_avulsa_status", "demanda_avulsa", ["status"], unique=False)
    op.create_index("ix_demanda_avulsa_contexto", "demanda_avulsa", ["contexto"], unique=False)

    op.drop_constraint("ck_registro_foco_um_contexto", "registro_foco", type_="check")
    op.add_column("registro_foco", sa.Column("demanda_avulsa_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_registro_foco_demanda_avulsa",
        "registro_foco", "demanda_avulsa",
        ["demanda_avulsa_id"], ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_registro_foco_demanda_avulsa_id", "registro_foco", ["demanda_avulsa_id"], unique=False)
    op.create_check_constraint(
        "ck_registro_foco_um_contexto",
        "registro_foco",
        "num_nonnulls(tarefa_id, comercial_task_id, demanda_avulsa_id) = 1",
    )

    op.create_table(
        "foco_ajuste",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("registro_foco_id", sa.BigInteger(), sa.ForeignKey("registro_foco.id", ondelete="SET NULL"), nullable=True),
        sa.Column("tarefa_id", sa.BigInteger(), sa.ForeignKey("tarefa.id", ondelete="SET NULL"), nullable=True),
        sa.Column("comercial_task_id", sa.BigInteger(), sa.ForeignKey("comercial_task.id", ondelete="SET NULL"), nullable=True),
        sa.Column("demanda_avulsa_id", sa.BigInteger(), sa.ForeignKey("demanda_avulsa.id", ondelete="SET NULL"), nullable=True),
        sa.Column("inicio_solicitado", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fim_solicitado", sa.DateTime(timezone=True), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pendente"),
        sa.Column("era_ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("decidido_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decidido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("observacao_gestor", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_foco_ajuste_status", "foco_ajuste", ["status"], unique=False)
    op.create_index("ix_foco_ajuste_envoxer", "foco_ajuste", ["envoxer_id"], unique=False)
    op.create_check_constraint(
        "ck_foco_ajuste_contexto",
        "foco_ajuste",
        "(registro_foco_id IS NOT NULL) OR (num_nonnulls(tarefa_id, comercial_task_id, demanda_avulsa_id) = 1)",
    )

def downgrade() -> None:
    op.drop_constraint("ck_foco_ajuste_contexto", "foco_ajuste", type_="check")
    op.drop_index("ix_foco_ajuste_envoxer", table_name="foco_ajuste")
    op.drop_index("ix_foco_ajuste_status", table_name="foco_ajuste")
    op.drop_table("foco_ajuste")

    op.drop_constraint("ck_registro_foco_um_contexto", "registro_foco", type_="check")
    op.drop_index("ix_registro_foco_demanda_avulsa_id", table_name="registro_foco")
    op.drop_constraint("fk_registro_foco_demanda_avulsa", "registro_foco", type_="foreignkey")
    op.drop_column("registro_foco", "demanda_avulsa_id")
    op.create_check_constraint(
        "ck_registro_foco_um_contexto",
        "registro_foco",
        "num_nonnulls(tarefa_id, comercial_task_id) = 1",
    )

    op.drop_index("ix_demanda_avulsa_contexto", table_name="demanda_avulsa")
    op.drop_index("ix_demanda_avulsa_status", table_name="demanda_avulsa")
    op.drop_index("ix_demanda_avulsa_responsavel", table_name="demanda_avulsa")
    op.drop_table("demanda_avulsa")

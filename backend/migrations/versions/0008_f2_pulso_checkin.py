"""F2 — Módulo 3: pulso_satisfacao, check_in

Revision ID: 0008_f2_pulso_checkin
Revises: 0007_f2_solicitacoes
Create Date: 2026-07-06
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008_f2_pulso_checkin"
down_revision: Union[str, None] = "0007_f2_solicitacoes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

metodo_pulso_enum = sa.Enum(
    "ligacao", "pesquisa", "estimativa_interna", "conversa_avulsa", name="metodo_pulso_enum"
)
tipo_checkin_enum = sa.Enum(
    "ligacao", "reuniao", "mensagem", "email", "presencial", name="tipo_checkin_enum"
)
motivo_checkin_enum = sa.Enum(
    "rotina", "checkpoint_retencao", "alerta_farol", "alteracao_escopo", "outro", name="motivo_checkin_enum"
)
humor_checkin_enum = sa.Enum(
    "positivo", "neutro", "negativo", "critico", name="humor_checkin_enum"
)


def upgrade() -> None:
    op.create_table(
        "pulso_satisfacao",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ano_mes", sa.String(7), nullable=False),
        sa.Column("nota", sa.Integer, nullable=False),
        sa.Column("comentario", sa.Text, nullable=True),
        sa.Column("metodo", metodo_pulso_enum, nullable=False, server_default="ligacao"),
        sa.Column("respondente_cliente_nome", sa.String(120), nullable=True),
        sa.Column("registrado_por_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cliente_id", "ano_mes", name="uq_pulso_cliente_mes"),
        sa.CheckConstraint("nota BETWEEN 0 AND 10", name="chk_pulso_nota"),
    )
    op.create_index("idx_pulso_cliente", "pulso_satisfacao", ["cliente_id", "ano_mes"])
    op.create_index("idx_pulso_nota", "pulso_satisfacao", ["nota"])

    op.create_table(
        "check_in",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger, sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("data_realizado", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", tipo_checkin_enum, nullable=False),
        sa.Column("motivo", motivo_checkin_enum, nullable=False, server_default="rotina"),
        sa.Column("responsavel_envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("humor", humor_checkin_enum, nullable=True),
        sa.Column("observacao", sa.Text, nullable=True),
        sa.Column("proximo_sugerido", sa.Date, nullable=True),
        sa.Column("proximo_realizado", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_checkin_cliente", "check_in", ["cliente_id", "data_realizado"])
    op.create_index("idx_checkin_proximo", "check_in", ["proximo_sugerido", "proximo_realizado"])


def downgrade() -> None:
    op.drop_table("check_in")
    op.drop_table("pulso_satisfacao")
    humor_checkin_enum.drop(op.get_bind(), checkfirst=True)
    motivo_checkin_enum.drop(op.get_bind(), checkfirst=True)
    tipo_checkin_enum.drop(op.get_bind(), checkfirst=True)
    metodo_pulso_enum.drop(op.get_bind(), checkfirst=True)

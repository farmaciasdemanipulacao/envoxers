"""PDI Jornada interativa

Revision ID: 0052
Revises: 0051
"""
from alembic import op
import sqlalchemy as sa
revision = "0052"
down_revision = "0051_tarefa_historico_etapas"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("pdi_jornada",
        sa.Column("id",sa.BigInteger(),primary_key=True,autoincrement=True),
        sa.Column("envoxer_id",sa.BigInteger(),sa.ForeignKey("envoxer.id"),nullable=False),
        sa.Column("gestor_id",sa.BigInteger(),sa.ForeignKey("envoxer.id"),nullable=False),
        sa.Column("nome",sa.String(160),nullable=False),
        sa.Column("inicio",sa.Date(),nullable=False),
        sa.Column("fim",sa.Date(),nullable=False),
        sa.Column("lembrete_dia",sa.Integer(),nullable=False,server_default="4"),
        sa.Column("lembrete_ativo",sa.Boolean(),nullable=False,server_default=sa.true()),
        sa.Column("status",sa.String(20),nullable=False,server_default="ativa"),
        sa.Column("criado_em",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()))
    op.create_index("ix_pdi_jornada_envoxer","pdi_jornada",["envoxer_id"])
    op.create_table("pdi_registro",
        sa.Column("id",sa.BigInteger(),primary_key=True,autoincrement=True),
        sa.Column("jornada_id",sa.BigInteger(),sa.ForeignKey("pdi_jornada.id",ondelete="CASCADE"),nullable=False),
        sa.Column("autor_id",sa.BigInteger(),sa.ForeignKey("envoxer.id"),nullable=False),
        sa.Column("acao_id",sa.BigInteger(),sa.ForeignKey("pdi_acao.id",ondelete="SET NULL")),
        sa.Column("tipo",sa.String(20),nullable=False),
        sa.Column("marco_dia",sa.Integer()),
        sa.Column("situacao",sa.Text(),nullable=False),
        sa.Column("impacto",sa.Text()),
        sa.Column("proposta",sa.Text()),
        sa.Column("resultado",sa.Text()),
        sa.Column("avaliacao",sa.Integer()),
        sa.Column("status_validacao",sa.String(20),nullable=False,server_default="pendente"),
        sa.Column("feedback_gestor",sa.Text()),
        sa.Column("validado_por_id",sa.BigInteger(),sa.ForeignKey("envoxer.id")),
        sa.Column("validado_em",sa.DateTime(timezone=True)),
        sa.Column("criado_em",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
        sa.CheckConstraint("tipo IN ('evidencia','marco')",name="ck_pdi_registro_tipo"),
        sa.CheckConstraint("status_validacao IN ('pendente','validada','ajustar')",name="ck_pdi_registro_validacao"),
        sa.CheckConstraint("avaliacao IS NULL OR avaliacao BETWEEN 1 AND 5",name="ck_pdi_registro_avaliacao"),
        sa.CheckConstraint("marco_dia IS NULL OR marco_dia IN (30,60,90)",name="ck_pdi_registro_marco"))
    op.create_index("ix_pdi_registro_jornada","pdi_registro",["jornada_id"])
    op.create_table("pdi_lembrete_envio",
        sa.Column("id",sa.BigInteger(),primary_key=True,autoincrement=True),
        sa.Column("destinatario_id",sa.BigInteger(),sa.ForeignKey("envoxer.id"),nullable=False),
        sa.Column("chave",sa.String(180),nullable=False,unique=True),
        sa.Column("enviado_em",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()))

def downgrade():
    op.drop_table("pdi_lembrete_envio")
    op.drop_index("ix_pdi_registro_jornada",table_name="pdi_registro")
    op.drop_table("pdi_registro")
    op.drop_index("ix_pdi_jornada_envoxer",table_name="pdi_jornada")
    op.drop_table("pdi_jornada")

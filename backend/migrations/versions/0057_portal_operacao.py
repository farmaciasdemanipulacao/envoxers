"""Portal operacional: unidades, permissões explícitas, solicitações e eventos.
Revision ID: 0057
Revises: 0056
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("cliente_contato", sa.Column("portal_papel", sa.String(32), nullable=False, server_default="consulta"))
    op.add_column("cliente_contato", sa.Column("portal_capacidades", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.create_table(
        "portal_unidade",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("tipo", sa.String(24), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("cliente_id", "tipo", "nome", name="uq_portal_unidade_nome"),
    )
    op.create_index("ix_portal_unidade_cliente", "portal_unidade", ["cliente_id"])
    op.create_table(
        "portal_contato_unidade",
        sa.Column("contato_id", sa.BigInteger(), sa.ForeignKey("cliente_contato.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("unidade_id", sa.BigInteger(), sa.ForeignKey("portal_unidade.id", ondelete="CASCADE"), primary_key=True),
    )
    op.add_column("solicitacao", sa.Column("protocolo", sa.String(32), nullable=True))
    op.create_unique_constraint("uq_solicitacao_protocolo", "solicitacao", ["protocolo"])
    op.add_column("solicitacao", sa.Column("portal_contato_id", sa.BigInteger(), sa.ForeignKey("cliente_contato.id", ondelete="SET NULL"), nullable=True))
    op.add_column("solicitacao", sa.Column("portal_unidade_id", sa.BigInteger(), sa.ForeignKey("portal_unidade.id", ondelete="SET NULL"), nullable=True))
    op.add_column("solicitacao", sa.Column("portal_frente_id", sa.BigInteger(), sa.ForeignKey("portal_unidade.id", ondelete="SET NULL"), nullable=True))
    op.add_column("solicitacao", sa.Column("prazo_solicitado", sa.Date(), nullable=True))
    op.add_column("solicitacao", sa.Column("prazo_confirmado", sa.Date(), nullable=True))
    op.add_column("solicitacao", sa.Column("briefing_estruturado", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")))
    op.create_index("ix_solicitacao_portal_contato", "solicitacao", ["portal_contato_id"])
    op.create_table(
        "portal_solicitacao_tarefa",
        sa.Column("solicitacao_id", sa.BigInteger(), sa.ForeignKey("solicitacao.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tarefa_id", sa.BigInteger(), sa.ForeignKey("tarefa.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "portal_evento",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("solicitacao_id", sa.BigInteger(), sa.ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("publico", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_portal_evento_solicitacao", "portal_evento", ["solicitacao_id", "criado_em"])
    op.create_table(
        "portal_comentario",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("solicitacao_id", sa.BigInteger(), sa.ForeignKey("solicitacao.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cliente_contato_id", sa.BigInteger(), sa.ForeignKey("cliente_contato.id", ondelete="SET NULL")),
        sa.Column("envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL")),
        sa.Column("autor_nome", sa.String(160), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("publico", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_portal_comentario_solicitacao", "portal_comentario", ["solicitacao_id", "criado_em"])
    op.create_table(
        "portal_formulario",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False),
        sa.Column("campos", JSONB, nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("criado_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("cliente_id", "versao", name="uq_portal_formulario_versao"),
    )
    op.create_index("ix_portal_formulario_cliente", "portal_formulario", ["cliente_id", "ativo"])

def downgrade():
    op.drop_index("ix_portal_formulario_cliente", table_name="portal_formulario")
    op.drop_table("portal_formulario")
    op.drop_index("ix_portal_comentario_solicitacao", table_name="portal_comentario")
    op.drop_table("portal_comentario")
    op.drop_index("ix_portal_evento_solicitacao", table_name="portal_evento")
    op.drop_table("portal_evento")
    op.drop_table("portal_solicitacao_tarefa")
    op.drop_index("ix_solicitacao_portal_contato", table_name="solicitacao")
    for col in ("briefing_estruturado", "prazo_confirmado", "prazo_solicitado", "portal_frente_id", "portal_unidade_id", "portal_contato_id"):
        op.drop_column("solicitacao", col)
    op.drop_constraint("uq_solicitacao_protocolo", "solicitacao", type_="unique")
    op.drop_column("solicitacao", "protocolo")
    op.drop_table("portal_contato_unidade")
    op.drop_index("ix_portal_unidade_cliente", table_name="portal_unidade")
    op.drop_table("portal_unidade")
    op.drop_column("cliente_contato", "portal_capacidades")
    op.drop_column("cliente_contato", "portal_papel")

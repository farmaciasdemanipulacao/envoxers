"""Catálogo de campanhas e vínculo de eventos operacionais nas solicitações.

Revision ID: 0060
Revises: 0059
"""
from alembic import op
import sqlalchemy as sa
revision="0060"
down_revision="0059"
branch_labels=None
depends_on=None

def upgrade():
    op.create_table(
       "portal_campanha",
       sa.Column("id",sa.BigInteger(),sa.Identity(),primary_key=True),
       sa.Column("cliente_id",sa.BigInteger(),sa.ForeignKey("cliente.id",ondelete="CASCADE"),nullable=False),
       sa.Column("nome",sa.String(160),nullable=False),
       sa.Column("portal_unidade_id",sa.BigInteger(),sa.ForeignKey("portal_unidade.id",ondelete="SET NULL")),
       sa.Column("portal_frente_id",sa.BigInteger(),sa.ForeignKey("portal_unidade.id",ondelete="SET NULL")),
       sa.Column("criado_por_contato_id",sa.BigInteger(),sa.ForeignKey("cliente_contato.id",ondelete="SET NULL")),
       sa.Column("ativo",sa.Boolean(),nullable=False,server_default=sa.true()),
       sa.Column("criado_em",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
       sa.UniqueConstraint("cliente_id","nome",name="uq_portal_campanha_nome"),
    )
    op.create_index("ix_portal_campanha_cliente_ativo","portal_campanha",["cliente_id","ativo"])
    op.add_column("evento",sa.Column("portal_unidade_id",sa.BigInteger(),sa.ForeignKey("portal_unidade.id",ondelete="SET NULL")))
    op.add_column("evento",sa.Column("portal_frente_id",sa.BigInteger(),sa.ForeignKey("portal_unidade.id",ondelete="SET NULL")))
    op.add_column("solicitacao",sa.Column("portal_campanha_id",sa.BigInteger(),sa.ForeignKey("portal_campanha.id",ondelete="SET NULL")))
    op.add_column("solicitacao",sa.Column("portal_evento_id",sa.BigInteger(),sa.ForeignKey("evento.id",ondelete="SET NULL")))
    op.create_index("ix_solicitacao_portal_campanha","solicitacao",["cliente_id","portal_campanha_id"])
    op.create_index("ix_solicitacao_portal_evento","solicitacao",["cliente_id","portal_evento_id"])

def downgrade():
    op.drop_index("ix_solicitacao_portal_evento",table_name="solicitacao")
    op.drop_index("ix_solicitacao_portal_campanha",table_name="solicitacao")
    op.drop_column("solicitacao","portal_evento_id")
    op.drop_column("solicitacao","portal_campanha_id")
    op.drop_column("evento","portal_frente_id")
    op.drop_column("evento","portal_unidade_id")
    op.drop_index("ix_portal_campanha_cliente_ativo",table_name="portal_campanha")
    op.drop_table("portal_campanha")

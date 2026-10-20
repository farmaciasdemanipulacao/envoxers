"""Configuração por cliente para Portal do Cliente Envoxers.
Revision ID: 0059
Revises: 0058
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision="0059"
down_revision="0058"
branch_labels=None
depends_on=None

def upgrade():
    op.create_table("portal_cliente_config",
      sa.Column("cliente_id",sa.BigInteger(),sa.ForeignKey("cliente.id",ondelete="CASCADE"),primary_key=True),
      sa.Column("habilitado",sa.Boolean(),nullable=False,server_default=sa.false()),
      sa.Column("modulos",JSONB,nullable=False,server_default=sa.text("'{}'::jsonb")),
      sa.Column("notificacoes",JSONB,nullable=False,server_default=sa.text("'{}'::jsonb")),
      sa.Column("visibilidade",JSONB,nullable=False,server_default=sa.text("'{}'::jsonb")),
      sa.Column("atualizado_em",sa.DateTime(timezone=True),nullable=False,server_default=sa.func.now()),
    )

def downgrade():
    op.drop_table("portal_cliente_config")

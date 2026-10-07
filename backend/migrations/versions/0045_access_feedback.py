"""Perfis de acesso configuráveis e prioridade em erros/ideias.

Revision ID: 0045_access_feedback
Revises: 0044_avulsas_foco
Create Date: 2026-10-07
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0045_access_feedback"
down_revision: Union[str, None] = "0044_avulsas_foco"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        "perfil_acesso",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(length=100), nullable=False, unique=True),
        sa.Column("slug", sa.String(length=100), nullable=False, unique=True),
        sa.Column("nivel_base", sa.String(length=20), nullable=False),
        sa.Column("modulos", sa.JSON(), nullable=False),
        sa.Column("sistema", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    perfil = sa.table(
        "perfil_acesso",
        sa.column("nome", sa.String()),
        sa.column("slug", sa.String()),
        sa.column("nivel_base", sa.String()),
        sa.column("modulos", sa.JSON()),
        sa.column("sistema", sa.Boolean()),
        sa.column("ativo", sa.Boolean()),
    )
    op.bulk_insert(perfil, [
        {
            "nome": "Admin",
            "slug": "admin",
            "nivel_base": "admin",
            "modulos": ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","admin","configuracoes"],
            "sistema": True,
            "ativo": True,
        },
        {
            "nome": "Gestor",
            "slug": "gestor",
            "nivel_base": "gestor",
            "modulos": ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","admin","configuracoes"],
            "sistema": True,
            "ativo": True,
        },
        {
            "nome": "Envoxer",
            "slug": "envoxer",
            "nivel_base": "envoxer",
            "modulos": ["chat","comercial","operacao","entregas","farol","icp","desenvolvimento","configuracoes"],
            "sistema": True,
            "ativo": True,
        },
        {
            "nome": "Comercial",
            "slug": "comercial",
            "nivel_base": "comercial",
            "modulos": ["chat","comercial","operacao"],
            "sistema": True,
            "ativo": True,
        },
    ])

    op.add_column("envoxer", sa.Column("perfil_acesso_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_envoxer_perfil_acesso",
        "envoxer", "perfil_acesso",
        ["perfil_acesso_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_envoxer_perfil_acesso_id", "envoxer", ["perfil_acesso_id"], unique=False)

    op.execute("""
        UPDATE envoxer e
        SET perfil_acesso_id = p.id
        FROM perfil_acesso p
        WHERE p.slug = e.permissao::text
    """)

    op.add_column("feedback_sistema", sa.Column("prioridade", sa.String(length=20), nullable=False, server_default="media"))
    op.create_index("ix_feedback_sistema_prioridade", "feedback_sistema", ["prioridade"], unique=False)

def downgrade() -> None:
    op.drop_index("ix_feedback_sistema_prioridade", table_name="feedback_sistema")
    op.drop_column("feedback_sistema", "prioridade")

    op.drop_index("ix_envoxer_perfil_acesso_id", table_name="envoxer")
    op.drop_constraint("fk_envoxer_perfil_acesso", "envoxer", type_="foreignkey")
    op.drop_column("envoxer", "perfil_acesso_id")
    op.drop_table("perfil_acesso")

"""F0 — cadastros base: envoxer, servico, cliente, cliente_servico, escopo

Revision ID: 0001_f0_schema
Revises:
Create Date: 2026-07-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "0001_f0_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

permissao_enum = sa.Enum("admin", "gestor", "envoxer", name="permissao_enum")
tipo_receita_enum = sa.Enum("recorrente", "pontual", name="tipo_receita_enum")
canal_aquisicao_enum = sa.Enum(
    "indicacao", "inbound", "outbound", "evento", "sdr", "outro", name="canal_aquisicao_enum"
)
maturidade_digital_enum = sa.Enum("baixa", "media", "alta", name="maturidade_digital_enum")
status_farol_enum = sa.Enum("verde", "amarelo", "vermelho", name="status_farol_enum")


def upgrade() -> None:
    # Os tipos ENUM são criados automaticamente pelo SQLAlchemy no primeiro
    # create_table que os referencia (cada enum é usado em uma única tabela aqui) —
    # criá-los manualmente antes causa "type already exists" (DuplicateObjectError).
    op.create_table(
        "envoxer",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("email", sa.String(160), nullable=False),
        sa.Column("cargo", sa.String(80), nullable=False),
        sa.Column("custo_hora", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("permissao", permissao_enum, nullable=False, server_default="envoxer"),
        sa.Column("senha_hash", sa.String(255), nullable=False),
        sa.Column("foto_url", sa.String(500), nullable=True),
        sa.Column("pontos", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("email", name="uq_envoxer_email"),
    )
    op.create_index("idx_envoxer_permissao", "envoxer", ["permissao"])
    op.create_index("idx_envoxer_ativo", "envoxer", ["ativo", "deleted_at"])

    op.create_table(
        "servico",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(80), nullable=False),
        sa.Column("slug", sa.String(40), nullable=False),
        sa.Column("descricao", sa.String(300), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("slug", name="uq_servico_slug"),
    )

    op.create_table(
        "cliente",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("nome", sa.String(160), nullable=False),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("valor_contrato", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("tipo_receita", tipo_receita_enum, nullable=False, server_default="recorrente"),
        sa.Column("data_inicio_contrato", sa.Date, nullable=True),
        sa.Column("data_cancelamento", sa.Date, nullable=True),
        sa.Column("segmento", sa.String(80), nullable=True),
        sa.Column("canal_aquisicao", canal_aquisicao_enum, nullable=True),
        sa.Column("ticket", sa.Numeric(12, 2), nullable=True),
        sa.Column("maturidade_digital", maturidade_digital_enum, nullable=True),
        sa.Column(
            "responsavel_envoxer_id",
            sa.BigInteger,
            sa.ForeignKey("envoxer.id", ondelete="SET NULL", onupdate="CASCADE"),
            nullable=True,
        ),
        sa.Column("links_redes", JSONB, nullable=True),
        sa.Column("observacoes", sa.Text, nullable=True),
        sa.Column("status_farol", status_farol_enum, nullable=False, server_default="verde"),
        sa.Column("termometro_whatsapp", sa.String(20), nullable=True),
        sa.Column("termometro_whatsapp_valor", sa.Numeric(3, 1), nullable=True),
        sa.Column("termometro_whatsapp_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultima_interacao_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ativo", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("tenant_id", sa.BigInteger, nullable=True, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_cliente_responsavel", "cliente", ["responsavel_envoxer_id"])
    op.create_index("idx_cliente_ativo", "cliente", ["ativo", "deleted_at"])
    op.create_index("idx_cliente_farol", "cliente", ["status_farol"])
    op.create_index("idx_cliente_tipo_receita", "cliente", ["tipo_receita"])
    op.create_index("idx_cliente_segmento", "cliente", ["segmento"])
    op.create_index("idx_cliente_data_inicio", "cliente", ["data_inicio_contrato"])

    op.create_table(
        "cliente_servico",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "cliente_id", sa.BigInteger,
            sa.ForeignKey("cliente.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False,
        ),
        sa.Column(
            "servico_id", sa.BigInteger,
            sa.ForeignKey("servico.id", ondelete="RESTRICT", onupdate="CASCADE"), nullable=False,
        ),
        sa.Column("valor_mensal", sa.Numeric(12, 2), nullable=False, server_default="0"),
        sa.Column("observacao", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cliente_id", "servico_id", name="uq_cliente_servico"),
    )
    op.create_index("idx_cs_cliente", "cliente_servico", ["cliente_id"])
    op.create_index("idx_cs_servico", "cliente_servico", ["servico_id"])

    op.create_table(
        "escopo",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "cliente_id", sa.BigInteger,
            sa.ForeignKey("cliente.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False,
        ),
        sa.Column("posts_mes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("videos_mes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("campanhas_mes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("limite_alteracoes", sa.BigInteger, nullable=False, server_default="2"),
        sa.Column("outros_itens", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("cliente_id", name="uq_escopo_cliente"),
    )


def downgrade() -> None:
    # drop_table dispara o drop automático dos tipos ENUM associados
    # (mesma lógica de auto-criação usada no upgrade).
    op.drop_table("escopo")
    op.drop_table("cliente_servico")
    op.drop_table("cliente")
    op.drop_table("servico")
    op.drop_table("envoxer")

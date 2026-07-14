"""Portal do Cliente — Módulo B: Itens de Escopo (controle de entregáveis)

Cria item_escopo/item_escopo_historico/entrega_manual/alerta_entrega, adiciona
tarefa.item_escopo_id e migra os dados existentes de `escopo`
(posts_mes/videos_mes/campanhas_mes/outros_itens) pra linhas de item_escopo.
`escopo.limite_alteracoes` continua onde está — é um conceito diferente
(limite de rodadas de alteração por peça), não um entregável.

Revision ID: 0020_item_escopo
Revises: 0019_cliente_contato
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0020_item_escopo"
down_revision: Union[str, None] = "0019_cliente_contato"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "item_escopo",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tipo", sa.String(length=60), nullable=False),
        sa.Column("descricao", sa.String(length=300), nullable=True),
        sa.Column("cadencia", sa.Enum("mensal", "pontual", name="cadencia_item_escopo_enum"), nullable=False, server_default="mensal"),
        sa.Column("quantidade", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_item_escopo_cliente_id", "item_escopo", ["cliente_id"])

    op.create_table(
        "item_escopo_historico",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("item_escopo_id", sa.BigInteger(), sa.ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantidade_anterior", sa.Integer(), nullable=False),
        sa.Column("quantidade_nova", sa.Integer(), nullable=False),
        sa.Column("motivo", sa.Text(), nullable=True),
        sa.Column("alterado_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("documento_acordo_id", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_item_escopo_historico_item_escopo_id", "item_escopo_historico", ["item_escopo_id"])

    op.create_table(
        "entrega_manual",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("item_escopo_id", sa.BigInteger(), sa.ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ano_mes", sa.String(length=7), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column("lancado_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_entrega_manual_item_mes", "entrega_manual", ["item_escopo_id", "ano_mes"])

    op.create_table(
        "alerta_entrega",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("cliente_id", sa.BigInteger(), sa.ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False),
        sa.Column("item_escopo_id", sa.BigInteger(), sa.ForeignKey("item_escopo.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ano_mes", sa.String(length=7), nullable=False),
        sa.Column("quantidade_contratada", sa.Integer(), nullable=False),
        sa.Column("quantidade_entregue", sa.Integer(), nullable=False),
        sa.Column("motivo_texto", sa.Text(), nullable=False),
        sa.Column("status", sa.Enum("aberto", "reconhecido", "resolvido", "ignorado", name="status_alerta_entrega_enum"), nullable=False, server_default="aberto"),
        sa.Column("reconhecido_por_envoxer_id", sa.BigInteger(), sa.ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reconhecido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolvido_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolucao_nota", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_alerta_entrega_item_mes", "alerta_entrega", ["item_escopo_id", "ano_mes"], unique=True)

    op.add_column("tarefa", sa.Column("item_escopo_id", sa.BigInteger(), sa.ForeignKey("item_escopo.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_tarefa_item_escopo_id", "tarefa", ["item_escopo_id"])

    # ---------- Migração de dados: escopo (campos fixos) -> item_escopo ----------
    conn = op.get_bind()
    escopo_tbl = sa.table(
        "escopo",
        sa.column("cliente_id", sa.BigInteger),
        sa.column("posts_mes", sa.BigInteger),
        sa.column("videos_mes", sa.BigInteger),
        sa.column("campanhas_mes", sa.BigInteger),
        sa.column("outros_itens", sa.Text),
    )
    item_escopo_tbl = sa.table(
        "item_escopo",
        sa.column("cliente_id", sa.BigInteger),
        sa.column("tipo", sa.String),
        sa.column("descricao", sa.String),
        # create_type=False: o tipo já foi criado pelo create_table acima —
        # asyncpg não faz cast implícito de varchar pra enum num bulk_insert,
        # por isso a coluna precisa do tipo Enum de verdade aqui também.
        sa.column("cadencia", sa.Enum("mensal", "pontual", name="cadencia_item_escopo_enum", create_type=False)),
        sa.column("quantidade", sa.Integer),
        sa.column("ativo", sa.Boolean),
    )
    linhas = conn.execute(sa.select(
        escopo_tbl.c.cliente_id, escopo_tbl.c.posts_mes, escopo_tbl.c.videos_mes,
        escopo_tbl.c.campanhas_mes, escopo_tbl.c.outros_itens,
    )).fetchall()

    novos_itens = []
    for cliente_id, posts_mes, videos_mes, campanhas_mes, outros_itens in linhas:
        if posts_mes and posts_mes > 0:
            novos_itens.append({"cliente_id": cliente_id, "tipo": "post_social", "descricao": None, "cadencia": "mensal", "quantidade": posts_mes, "ativo": True})
        if videos_mes and videos_mes > 0:
            novos_itens.append({"cliente_id": cliente_id, "tipo": "video", "descricao": None, "cadencia": "mensal", "quantidade": videos_mes, "ativo": True})
        if campanhas_mes and campanhas_mes > 0:
            novos_itens.append({"cliente_id": cliente_id, "tipo": "campanha", "descricao": None, "cadencia": "mensal", "quantidade": campanhas_mes, "ativo": True})
        if outros_itens and outros_itens.strip():
            novos_itens.append({
                "cliente_id": cliente_id, "tipo": "outro",
                "descricao": f"[Migrado automaticamente — revisar quantidade] {outros_itens.strip()}",
                "cadencia": "mensal", "quantidade": 1, "ativo": True,
            })

    if novos_itens:
        conn.execute(item_escopo_tbl.insert(), novos_itens)


def downgrade() -> None:
    op.drop_index("ix_tarefa_item_escopo_id", table_name="tarefa")
    op.drop_column("tarefa", "item_escopo_id")
    op.drop_index("ix_alerta_entrega_item_mes", table_name="alerta_entrega")
    op.drop_table("alerta_entrega")
    op.drop_index("ix_entrega_manual_item_mes", table_name="entrega_manual")
    op.drop_table("entrega_manual")
    op.drop_index("ix_item_escopo_historico_item_escopo_id", table_name="item_escopo_historico")
    op.drop_table("item_escopo_historico")
    op.drop_index("ix_item_escopo_cliente_id", table_name="item_escopo")
    op.drop_table("item_escopo")
    op.execute("DROP TYPE IF EXISTS status_alerta_entrega_enum")
    op.execute("DROP TYPE IF EXISTS cadencia_item_escopo_enum")

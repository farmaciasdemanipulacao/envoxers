"""Push notifications — tabela push_subscription (Web Push por Envoxer/dispositivo)

Revision ID: 0015_push_subscription
Revises: 0014_chat
Create Date: 2026-07-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0015_push_subscription"
down_revision: Union[str, None] = "0014_chat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "push_subscription",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("envoxer_id", sa.BigInteger, sa.ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False),
        sa.Column("endpoint", sa.Text, nullable=False, unique=True),
        sa.Column("p256dh", sa.Text, nullable=False),
        sa.Column("auth", sa.Text, nullable=False),
        sa.Column("user_agent", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_push_subscription_envoxer", "push_subscription", ["envoxer_id"])


def downgrade() -> None:
    op.drop_index("idx_push_subscription_envoxer", table_name="push_subscription")
    op.drop_table("push_subscription")

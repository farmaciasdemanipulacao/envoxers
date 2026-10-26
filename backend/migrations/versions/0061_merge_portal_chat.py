"""Join the portal and chat migration histories without changing tables.

Revision ID: 0061_portal_chat_merge
Revises: 0060, chat_reactions_20261023

Both tracks started at 0056. This revision represents a graph merge only.
Production chat data and existing portal data must be preserved.
"""
revision = "0061_portal_chat_merge"
down_revision = ("0060", "chat_reactions_20261023")
branch_labels = None
depends_on = None

def upgrade():
    pass

def downgrade():
    pass

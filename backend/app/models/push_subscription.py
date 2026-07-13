"""Model: PushSubscription — inscrição de Web Push de um Envoxer num dispositivo/navegador."""
from typing import Optional

from sqlalchemy import BigInteger, String, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class PushSubscription(Base, TimestampMixin):
    __tablename__ = "push_subscription"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)

    # Campos da Web Push Subscription (PushSubscriptionJSON do browser)
    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)  # chave pública do cliente
    auth: Mapped[str] = mapped_column(Text, nullable=False)    # segredo de autenticação

    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

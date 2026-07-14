"""Model: ClienteContato — pessoas do lado do cliente com login no Portal do Cliente."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class ClienteContato(Base, TimestampMixin):
    __tablename__ = "cliente_contato"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    cargo: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    email: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    senha_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    criado_por_envoxer_id: Mapped[Optional[int]] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="SET NULL"), nullable=True
    )

    # Link de definição de primeira senha (e reenvio) — sem infra de e-mail no
    # projeto, o gestor copia o link e manda pelo canal que preferir.
    set_senha_token: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, unique=True)
    set_senha_token_expira: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

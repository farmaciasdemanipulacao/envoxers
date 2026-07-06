"""Model: Servico — catálogo fixo dos serviços da Envox."""
from typing import Optional

from sqlalchemy import BigInteger, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Servico(Base, TimestampMixin):
    __tablename__ = "servico"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    descricao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

"""Model: Envoxer — pessoas que trabalham na agência. Também é a entidade de login."""
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Integer, String, Numeric, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

PERMISSAO_VALUES = ("admin", "gestor", "envoxer")


class Envoxer(Base, TimestampMixin):
    __tablename__ = "envoxer"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(160), nullable=False, unique=True)
    cargo: Mapped[str] = mapped_column(String(80), nullable=False)
    salario_mensal: Mapped[Optional[float]] = mapped_column(Numeric(10, 2), nullable=True)
    horas_mes: Mapped[int] = mapped_column(Integer, nullable=False, default=220)
    # Calculado (salario_mensal / horas_mes) e persistido pela API — não editável diretamente.
    custo_hora: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)

    permissao: Mapped[str] = mapped_column(
        SAEnum(*PERMISSAO_VALUES, name="permissao_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="envoxer",
    )

    # Adição fora do schema.sql original — necessária para login (o schema não previa autenticação).
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    foto_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    pontos: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # gamificação — F4
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, default=1)

    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

"""Model: CompetenciaCatalogo — catálogo de competências avaliadas no Feedback 360° (F4, D-121)."""
from typing import Optional

from sqlalchemy import BigInteger, String, Text, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CompetenciaCatalogo(Base):
    __tablename__ = "competencia_catalogo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

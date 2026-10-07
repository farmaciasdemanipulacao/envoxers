from sqlalchemy import BigInteger, Boolean, JSON, String
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base, TimestampMixin

class PerfilAcesso(Base, TimestampMixin):
    __tablename__ = "perfil_acesso"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    nivel_base: Mapped[str] = mapped_column(String(20), nullable=False)
    modulos: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sistema: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

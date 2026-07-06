"""Model: MotivoChurnCatalogo — catálogo pré-definido de motivos de cancelamento (F3)."""
from sqlalchemy import BigInteger, String, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

CATEGORIA_MOTIVO_CHURN_VALUES = ("preco", "entrega", "encaixe", "externa", "ativa", "sem_resposta")


class MotivoChurnCatalogo(Base):
    __tablename__ = "motivo_churn_catalogo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(80), nullable=False)
    categoria: Mapped[str] = mapped_column(
        SAEnum(*CATEGORIA_MOTIVO_CHURN_VALUES, name="categoria_motivo_churn_enum", values_callable=lambda e: list(e)),
        nullable=False,
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

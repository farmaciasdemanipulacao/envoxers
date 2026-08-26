"""Model: PerguntaClima — pergunta configurável de um ciclo de Pesquisa de Clima (F4, D-121)."""
from sqlalchemy import BigInteger, String, Integer, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

TIPO_PERGUNTA_CLIMA_VALUES = ("likert", "aberta")


class PerguntaClima(Base):
    __tablename__ = "pergunta_clima"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ciclo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False)
    texto: Mapped[str] = mapped_column(String(300), nullable=False)
    tipo: Mapped[str] = mapped_column(
        SAEnum(*TIPO_PERGUNTA_CLIMA_VALUES, name="tipo_pergunta_clima_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="likert",
    )
    ordem: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

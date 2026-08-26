"""Model: RespostaClima — resposta de um envoxer a um ciclo de Pesquisa de Clima (F4, D-121).

Híbrida por decisão do Gus: guarda o vínculo envoxer_id no banco (não é anônimo
de fato), mas a API nunca expõe resposta individual pra gestor — só agregados.
Admin tem rota de auditoria separada pro dado bruto.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RespostaClima(Base):
    __tablename__ = "resposta_clima"
    __table_args__ = (UniqueConstraint("ciclo_id", "envoxer_id", name="uq_resposta_clima_par"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    ciclo_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("ciclo_avaliacao.id", ondelete="CASCADE"), nullable=False)
    envoxer_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False)
    # {pergunta_id: valor} — int 1-5 (likert) ou string (aberta)
    respostas: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    enviada_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

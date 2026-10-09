from sqlalchemy import BigInteger, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class FeedbackSistemaVisualizacao(Base, TimestampMixin):
    __tablename__ = "feedback_sistema_visualizacao"
    __table_args__ = (
        UniqueConstraint("feedback_id", "envoxer_id", name="uq_feedback_visualizacao_usuario"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    feedback_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("feedback_sistema.id", ondelete="CASCADE"), nullable=False, index=True
    )
    envoxer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("envoxer.id", ondelete="CASCADE"), nullable=False, index=True
    )

"""Model: ItemEscopo — entregável contratado (posts, vídeos, fotos, GMN…), com
quantidade e cadência. Substitui os campos fixos antigos de `Escopo`
(posts_mes/videos_mes/campanhas_mes/outros_itens) por uma lista de itens
livre — `tipo` é texto (com sugestões no frontend via datalist), não enum
fechado, pra não exigir deploy sempre que o time inventar um entregável novo.
"""
from typing import Optional

from sqlalchemy import BigInteger, String, Integer, Boolean, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

CADENCIA_ITEM_ESCOPO_VALUES = ("mensal", "pontual")

TIPO_ITEM_ESCOPO_SUGESTOES = [
    "post_social", "post_blog", "post_gmn", "foto", "video", "campanha", "reuniao", "outro",
]


class ItemEscopo(Base, TimestampMixin):
    __tablename__ = "item_escopo"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    cliente_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("cliente.id", ondelete="CASCADE"), nullable=False
    )
    tipo: Mapped[str] = mapped_column(String(60), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    cadencia: Mapped[str] = mapped_column(
        SAEnum(*CADENCIA_ITEM_ESCOPO_VALUES, name="cadencia_item_escopo_enum", values_callable=lambda e: list(e)),
        nullable=False,
        default="mensal",
    )
    quantidade: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

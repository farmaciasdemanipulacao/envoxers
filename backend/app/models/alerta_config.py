"""Model: AlertaConfig — catálogo de tipos de alerta (Farol geral, 7 sinais
individuais, chat DM) que o admin master liga/desliga e define quem recebe.
Base pro motor de regras customizadas (F5), que vai reusar esta tabela como
destino das regras criadas do zero.
"""
from typing import Optional

from sqlalchemy import BigInteger, Boolean, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class AlertaConfig(Base, TimestampMixin):
    __tablename__ = "alerta_config"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    chave: Mapped[str] = mapped_column(String(60), nullable=False, unique=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    grupo: Mapped[str] = mapped_column(String(30), nullable=False)  # "farol" | "chat"
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Papéis que recebem (ex.: ["admin","gestor"]). None/[] = não aplicável — o
    # destinatário já é fixo pelo próprio evento (ex.: chat_dm notifica só quem
    # recebeu a mensagem, não faz sentido escolher papel).
    papeis: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)

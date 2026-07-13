"""
Configurações centrais do Envoxers.
Todas as configurações vêm de variáveis de ambiente (.env).
"""
from typing import Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # === APP ===
    APP_NAME: str = "Envoxers"
    APP_VERSION: str = "0.1.0"
    APP_ENV: str = "development"  # development | production
    APP_HOST: str = "0.0.0.0"
    APP_PORT: int = 8000
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # === BANCO DE DADOS ===
    DATABASE_URL: str = "postgresql+asyncpg://envox:envox123@localhost:5432/envox_kanban"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    AUTO_MIGRATE: bool = True  # Roda alembic upgrade head no startup

    # === UPLOADS (F1 — criativo/anexos de tarefa) ===
    UPLOAD_DIR: str = "/app/uploads"  # volume persistente, ver docker-compose.yml

    # === SEGURANÇA ===
    SECRET_KEY: str = "CHANGE_THIS_IN_PRODUCTION_USE_64_RANDOM_CHARS"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 horas

    # === PUSH NOTIFICATIONS (VAPID) ===
    VAPID_PUBLIC_KEY: Optional[str] = None
    VAPID_PRIVATE_KEY: Optional[str] = None
    VAPID_CLAIM_EMAIL: str = "admin@envox.com.br"

    # === CORS ===
    ALLOWED_ORIGINS: Union[list[str], str] = ["http://localhost:8081"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v):
        if isinstance(v, str):
            v = v.strip().strip("[]")
            return [
                o.strip().strip('"').strip("'")
                for o in v.split(",")
                if o.strip().strip('"').strip("'")
            ]
        return v


settings = Settings()

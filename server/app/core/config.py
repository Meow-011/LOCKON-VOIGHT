"""
Application configuration — loaded from environment variables.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Central configuration for LOCKON VOIGHT server."""

    # Application
    APP_NAME: str = "LOCKON VOIGHT"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://voight:voight_secret@localhost:5432/voight_db"
    DATABASE_ECHO: bool = False

    # TimescaleDB (uses same PostgreSQL instance with extension)
    TIMESCALE_ENABLED: bool = True

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_CACHE_DB: int = 0
    REDIS_CELERY_DB: int = 1

    # JWT Authentication
    JWT_SECRET_KEY: str = "voight-dev-secret-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # gRPC
    GRPC_PORT: int = 50051
    GRPC_MAX_WORKERS: int = 10

    # Agent
    AGENT_HEARTBEAT_INTERVAL_SECONDS: int = 10
    AGENT_HEARTBEAT_TIMEOUT_SECONDS: int = 30

    # Scoring
    SCORE_THRESHOLD_GREEN: int = 30
    SCORE_THRESHOLD_YELLOW: int = 70
    SCORE_DECAY_RECENT_MINUTES: int = 1
    SCORE_DECAY_MEDIUM_MINUTES: int = 2
    SCORE_DECAY_OLD_MINUTES: int = 3

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Data Retention
    DATA_RETENTION_DAYS: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


settings = Settings()

# ─── Security Startup Checks ─────────────────────────────────
import logging
_logger = logging.getLogger(__name__)

if settings.JWT_SECRET_KEY == "voight-dev-secret-change-in-production":
    if settings.ENVIRONMENT == "production":
        raise RuntimeError(
            "\n\n🔴 FATAL: JWT_SECRET_KEY is still using the default value!\n"
            "   Generate a strong secret: python -c \"import secrets; print(secrets.token_urlsafe(64))\"\n"
            "   Set JWT_SECRET_KEY in your .env file before running in production.\n"
        )
    else:
        _logger.warning(
            "⚠️  JWT_SECRET_KEY is using the default dev value. "
            "Change this before deploying to production!"
        )

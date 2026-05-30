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
    GRPC_PORT: int = 50052
    GRPC_MAX_WORKERS: int = 10

    # gRPC TLS (mTLS)
    GRPC_TLS_ENABLED: bool = False
    GRPC_CA_CERT_PATH: str = "deploy/certs/generated/ca-cert.pem"
    GRPC_SERVER_CERT_PATH: str = "deploy/certs/generated/server-cert.pem"
    GRPC_SERVER_KEY_PATH: str = "deploy/certs/generated/server-key.pem"

    # Agent
    AGENT_HEARTBEAT_INTERVAL_SECONDS: int = 10
    AGENT_HEARTBEAT_TIMEOUT_SECONDS: int = 30

    # Resource anomaly thresholds
    RESOURCE_GPU_SPIKE_THRESHOLD: float = 80.0     # GPU % above this → GPU_SPIKE incident
    RESOURCE_VRAM_SPIKE_THRESHOLD_MB: float = 4096  # VRAM MB above this → VRAM_SPIKE incident

    # Scoring
    SCORE_THRESHOLD_GREEN: int = 30   # Score < GREEN → GREEN level
    SCORE_THRESHOLD_YELLOW: int = 70  # Score < YELLOW → YELLOW level, else RED
    SCORE_DECAY_RECENT_MINUTES: int = 1  # Full weight (×1.0) within this window
    SCORE_DECAY_MEDIUM_MINUTES: int = 2  # Reduced weight (×0.7) within this window
    SCORE_DECAY_OLD_MINUTES: int = 3     # Further reduced (×0.4), beyond → ×0.1

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

if settings.ENVIRONMENT == "production" and not settings.GRPC_TLS_ENABLED:
    _logger.warning(
        "⚠️  gRPC is running WITHOUT TLS in production! "
        "Set GRPC_TLS_ENABLED=true and provide certificate paths."
    )

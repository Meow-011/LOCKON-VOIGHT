"""
Celery configuration and app initialization.
"""

from celery import Celery
from app.core.config import settings

# Initialize Celery
celery_app = Celery(
    "voight",
    broker=settings.REDIS_URL.replace(f"/{settings.REDIS_CACHE_DB}", f"/{settings.REDIS_CELERY_DB}"),
    backend=settings.REDIS_URL.replace(f"/{settings.REDIS_CACHE_DB}", f"/{settings.REDIS_CELERY_DB}"),
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Beat schedule for periodic tasks
    beat_schedule={
        "check-heartbeat-timeouts": {
            "task": "app.tasks.monitoring.check_heartbeat_timeouts",
            "schedule": 15.0,  # Every 15 seconds
        },
        "cleanup-expired-data": {
            "task": "app.tasks.monitoring.cleanup_expired_data",
            "schedule": 3600.0,  # Every hour
        },
        "recalculate-all-scores": {
            "task": "app.tasks.monitoring.recalculate_active_scores",
            "schedule": 30.0,  # Every 30 seconds
        },
    },
)

"""
Background monitoring tasks — Celery workers for:
- Heartbeat timeout detection
- Score recalculation
- Data retention / cleanup
"""

import asyncio
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, delete, update

from app.tasks.celery_app import celery_app
from app.core.config import settings
from app.core.database import async_session_factory
from app.models import (
    Contestant, Competition, Heartbeat, Incident,
    ProcessLog, NetworkLog, ResourceSnapshot, IntegrityScore,
)
from app.services.telemetry import IncidentService


def run_async(coro):
    """Helper to run async code from sync Celery tasks."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="app.tasks.monitoring.check_heartbeat_timeouts")
def check_heartbeat_timeouts():
    """
    Check for agents that haven't sent a heartbeat within the timeout period.
    Creates HEARTBEAT_TIMEOUT incidents for offline agents.
    """
    run_async(_check_heartbeat_timeouts())


async def _check_heartbeat_timeouts():
    timeout = timedelta(seconds=settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS)
    cutoff = datetime.now(timezone.utc) - timeout

    async with async_session_factory() as db:
        # Find contestants who were online but haven't been seen since cutoff
        result = await db.execute(
            select(Contestant)
            .join(Competition, Contestant.competition_id == Competition.id)
            .where(
                Contestant.is_online == True,
                Contestant.is_enrolled == True,
                Contestant.last_seen < cutoff,
                Competition.status == "active",
            )
        )
        timed_out = result.scalars().all()

        for contestant in timed_out:
            # Mark offline
            contestant.is_online = False
            await db.commit()

            # Create heartbeat timeout incident
            await IncidentService.process_telemetry_and_score(
                db, contestant.id, "HEARTBEAT_TIMEOUT",
                evidence=f"Last seen: {contestant.last_seen.isoformat()}, "
                         f"timeout: {settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS}s",
            )


@celery_app.task(name="app.tasks.monitoring.recalculate_active_scores")
def recalculate_active_scores():
    """
    Periodically recalculate integrity scores for all active contestants.
    This ensures time-based decay is applied even without new telemetry.
    """
    run_async(_recalculate_active_scores())


async def _recalculate_active_scores():
    async with async_session_factory() as db:
        # Get all contestants in active competitions
        result = await db.execute(
            select(Contestant)
            .join(Competition, Contestant.competition_id == Competition.id)
            .where(
                Contestant.is_enrolled == True,
                Competition.status == "active",
            )
        )
        contestants = result.scalars().all()

        for contestant in contestants:
            await IncidentService.recalculate_score(db, contestant.id)


@celery_app.task(name="app.tasks.monitoring.cleanup_expired_data")
def cleanup_expired_data():
    """
    Delete telemetry data older than the retention period.
    Preserves incidents and scores for completed competitions.
    """
    run_async(_cleanup_expired_data())


async def _cleanup_expired_data():
    retention_days = settings.DATA_RETENTION_DAYS
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)

    async with async_session_factory() as db:
        # Delete old time-series data
        for model in [ProcessLog, NetworkLog, ResourceSnapshot, Heartbeat]:
            await db.execute(
                delete(model).where(model.ts < cutoff)
            )

        await db.commit()

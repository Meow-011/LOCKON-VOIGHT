"""
Health check endpoint.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check."""
    return {
        "status": "healthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


@router.get("/health/db")
async def database_health(db: AsyncSession = Depends(get_db)):
    """Database connectivity health check."""
    import time
    try:
        start_time = time.perf_counter()
        result = await db.execute(text("SELECT 1"))
        result.scalar()
        latency = (time.perf_counter() - start_time) * 1000
        return {"status": "healthy", "database": "connected", "latency_ms": round(latency, 2)}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}

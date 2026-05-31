import asyncio
import sys
import os
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.core.database import async_session_factory
from app.services.telemetry import TelemetryService, IncidentService
from app.models import Contestant

async def test():
    async with async_session_factory() as db:
        # Get first contestant
        from sqlalchemy import select
        res = await db.execute(select(Contestant))
        c = res.scalars().first()
        if not c:
            print("No contestant found")
            return
            
        print(f"Testing for contestant: {c.id}")
        
        # Manually trigger process_telemetry_and_score for AI_AGENT
        try:
            await IncidentService.process_telemetry_and_score(
                db, c.id, "AI_AGENT", "Test evidence"
            )
            print(f"process_telemetry_and_score completed. Pending warning: {TelemetryService.pending_warnings.get(str(c.id))}")
            
            # Check screen lock count
            res = await db.execute(select(Contestant).where(Contestant.id == c.id))
            c = res.scalars().first()
            print(f"Screen lock count: {c.screen_lock_count}")
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(test())

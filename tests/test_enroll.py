import asyncio
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.core.database import async_session_factory
from app.services.competition import ContestantService

async def test():
    async with async_session_factory() as db:
        try:
            contestant = await ContestantService.enroll(
                db,
                token="GLOBAL_COMP_KEY_12345::YOUR_TEAM_NAME_HERE",
                agent_fingerprint="test_fingerprint",
                agent_version="0.1.0"
            )
            print("Success!", contestant.id)
        except Exception as e:
            import traceback
            traceback.print_exc()

asyncio.run(test())

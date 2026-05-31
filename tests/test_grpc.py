import asyncio
import sys
import os
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app.core.database import async_session_factory
from app.models import Contestant
from app.grpc.server import start_grpc_server
import grpc
from proto.voight import telemetry_pb2
from proto.voight import telemetry_pb2_grpc

async def test():
    async with async_session_factory() as db:
        from sqlalchemy import select
        res = await db.execute(select(Contestant))
        c = res.scalars().first()
        if not c:
            print("No contestant found")
            return
            
        print(f"Testing for contestant: {c.id}")
        
        async with grpc.aio.insecure_channel('localhost:50051') as channel:
            stub = telemetry_pb2_grpc.TelemetryServiceStub(channel)
            
            async def generate_reports():
                yield telemetry_pb2.TelemetryReport(
                    agent_id="test_agent",
                    contestant_id=str(c.id),
                    process_snapshot=telemetry_pb2.ProcessSnapshot(
                        processes=[
                            telemetry_pb2.ProcessInfo(
                                name="chrome.exe",
                                pid=1234,
                                cmdline="ChatGPT - Google Chrome",
                                category="AI_AGENT"
                            )
                        ]
                    )
                )
                
            response = await stub.StreamTelemetry(generate_reports())
            print(f"Ack: {response.success}, Events: {response.events_received}")

asyncio.run(test())

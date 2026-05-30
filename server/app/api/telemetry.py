"""
Telemetry ingestion API — REST endpoints for receiving agent telemetry data.
These complement the gRPC service for agents that use HTTP fallback.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.services.telemetry import TelemetryService, IncidentService
from app.services.competition import ContestantService
from app.scoring.engine import scoring_engine
from app.schemas import (
    ProcessTelemetry, NetworkEventTelemetry,
    ResourceTelemetry, FileAlertTelemetry, HeartbeatTelemetry,
    MessageResponse,
)

router = APIRouter()


async def _validate_contestant(db: AsyncSession, contestant_id):
    """Validate that the contestant exists and is enrolled."""
    contestant = await ContestantService.get_by_id(db, contestant_id)
    if not contestant:
        raise HTTPException(status_code=404, detail="Unknown contestant")
    return contestant


@router.post("/processes", response_model=MessageResponse)
async def ingest_processes(
    body: ProcessTelemetry,
    db: AsyncSession = Depends(get_db),
):
    """Ingest process snapshot from agent."""
    await _validate_contestant(db, body.contestant_id)
    processes = [p.model_dump() for p in body.processes]
    await TelemetryService.ingest_processes(db, body.contestant_id, processes)

    # Check for AI processes and create incidents
    for proc in body.processes:
        ioa_type = scoring_engine.classify_process(proc.category)
        if ioa_type:
            await IncidentService.process_telemetry_and_score(
                db, body.contestant_id, ioa_type,
                evidence=f"Process: {proc.name} (PID: {proc.pid}, cmdline: {proc.cmdline})",
            )

    return MessageResponse(message=f"Ingested {len(body.processes)} process entries")


@router.post("/network", response_model=MessageResponse)
async def ingest_network_event(
    body: NetworkEventTelemetry,
    db: AsyncSession = Depends(get_db),
):
    """Ingest a network event from agent."""
    await _validate_contestant(db, body.contestant_id)
    await TelemetryService.ingest_network_event(db, body.contestant_id, body.model_dump())

    # Check for AI service connections
    if body.dst_domain:
        ioa_type = scoring_engine.classify_network_event(body.dst_domain)
        if ioa_type:
            await IncidentService.process_telemetry_and_score(
                db, body.contestant_id, ioa_type,
                evidence=f"Connection: {body.dst_domain} ({body.dst_ip}:{body.dst_port})",
            )

    return MessageResponse(message="Network event ingested")


@router.post("/resources", response_model=MessageResponse)
async def ingest_resources(
    body: ResourceTelemetry,
    db: AsyncSession = Depends(get_db),
):
    """Ingest resource usage snapshot from agent."""
    await _validate_contestant(db, body.contestant_id)
    await TelemetryService.ingest_resources(db, body.contestant_id, body.model_dump())

    # Check for GPU anomalies
    if body.gpu_percent > settings.RESOURCE_GPU_SPIKE_THRESHOLD:
        await IncidentService.process_telemetry_and_score(
            db, body.contestant_id, "GPU_SPIKE",
            evidence=f"GPU: {body.gpu_percent:.1f}%, VRAM: {body.vram_mb:.0f}MB",
        )

    if body.vram_mb > settings.RESOURCE_VRAM_SPIKE_THRESHOLD_MB:
        await IncidentService.process_telemetry_and_score(
            db, body.contestant_id, "VRAM_SPIKE",
            evidence=f"VRAM: {body.vram_mb:.0f}MB (threshold: {settings.RESOURCE_VRAM_SPIKE_THRESHOLD_MB}MB)",
        )

    return MessageResponse(message="Resource snapshot ingested")


@router.post("/file-alert", response_model=MessageResponse)
async def ingest_file_alert(
    body: FileAlertTelemetry,
    db: AsyncSession = Depends(get_db),
):
    """Ingest a file detection alert from agent."""
    await _validate_contestant(db, body.contestant_id)
    await IncidentService.process_telemetry_and_score(
        db, body.contestant_id, "MODEL_FILE",
        evidence=f"File: {body.file_name} ({body.file_size_bytes / 1024 / 1024:.1f}MB, type: {body.file_type})",
    )

    return MessageResponse(message="File alert processed")


@router.post("/heartbeat", response_model=dict)
async def ingest_heartbeat(
    body: HeartbeatTelemetry,
    db: AsyncSession = Depends(get_db),
):
    """Process agent heartbeat — update status and verify binary integrity."""
    await _validate_contestant(db, body.contestant_id)
    # Record heartbeat
    await TelemetryService.ingest_heartbeat(
        db, body.contestant_id, body.agent_version, body.agent_binary_hash,
    )

    # Update contestant last_seen
    await ContestantService.update_heartbeat(
        db, body.contestant_id, body.agent_version,
    )

    return {
        "acknowledged": True,
        "heartbeat_interval_seconds": 10,
    }

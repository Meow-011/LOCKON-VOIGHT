"""
Contestant API — Enrollment, status, and score endpoints.
"""

from uuid import UUID
from typing import List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.competition import ContestantService
from app.services.telemetry import IncidentService
from app.schemas import (
    ContestantResponse, EnrollmentRequest, EnrollmentResponse,
    IntegrityScoreResponse, IncidentResponse,
    MessageResponse,
)

router = APIRouter()


@router.post("/enroll", response_model=EnrollmentResponse)
async def enroll_agent(
    body: EnrollmentRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Enroll an agent using its enrollment token.
    This endpoint is called by the agent (no JWT required — uses enrollment token).
    """
    contestant = await ContestantService.enroll(
        db,
        token=body.enrollment_token,
        agent_fingerprint=body.agent_fingerprint,
        agent_version=body.agent_version,
    )

    if not contestant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid enrollment token",
        )

    return EnrollmentResponse(
        agent_id=str(contestant.id),
        contestant_id=contestant.id,
        competition_id=contestant.competition_id,
        config={
            "heartbeat_interval_seconds": 10,
        },
    )


@router.get("/", response_model=List[ContestantResponse])
async def list_all_contestants(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all contestants across all competitions."""
    from sqlalchemy import select
    from app.models import Contestant, ResourceSnapshot
    result = await db.execute(select(Contestant).order_by(Contestant.last_seen.desc().nulls_last()))
    contestants = result.scalars().all()
    
    results = []
    for c in contestants:
        resp = ContestantResponse.model_validate(c)
        if resp.last_seen:
            time_since_last_seen = (datetime.now(timezone.utc) - resp.last_seen).total_seconds()
            if time_since_last_seen > settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS:
                resp.is_online = False
        
        # Inject parsed properties for UI
        import re
        resp.version = c.agent_version or "unknown"
        if c.agent_fingerprint:
            resp.raw_fingerprint = c.agent_fingerprint
            ip_match = re.search(r'ip_address:\s*"([^"]+)"', c.agent_fingerprint)
            if ip_match:
                resp.ip = ip_match.group(1)
            os_match = re.search(r'os:\s*"([^"]+)"', c.agent_fingerprint)
            if os_match:
                resp.os = os_match.group(1).upper()
                
        resp.status = "ONLINE" if resp.is_online else "OFFLINE"
        
        score = await ContestantService.get_latest_score(db, c.id)
        if score:
            resp.latest_score = score.score
            resp.latest_level = score.level
            if resp.is_online and resp.latest_level in ["ELEVATED", "CRITICAL", "YELLOW", "RED"]:
                resp.status = "WARNING"
                
        # Inject latest resource metrics
        res_query = await db.execute(
            select(ResourceSnapshot)
            .where(ResourceSnapshot.contestant_id == c.id)
            .order_by(ResourceSnapshot.ts.desc())
            .limit(1)
        )
        latest_res = res_query.scalar_one_or_none()
        if latest_res:
            resp.cpu = round(latest_res.cpu_pct or 0.0, 1)
            resp.ram = round(latest_res.ram_pct or 0.0, 1)
            
        results.append(resp)
        
    return results


@router.get("/{contestant_id}", response_model=ContestantResponse)
async def get_contestant(
    contestant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get contestant details."""
    contestant = await ContestantService.get_by_id(db, contestant_id)
    if not contestant:
        raise HTTPException(status_code=404, detail="Contestant not found")

    resp = ContestantResponse.model_validate(contestant)
    
    # Dynamically compute is_online for UI since Celery worker might not be running
    if resp.last_seen:
        time_since_last_seen = (datetime.now(timezone.utc) - resp.last_seen).total_seconds()
        if time_since_last_seen > settings.AGENT_HEARTBEAT_TIMEOUT_SECONDS:
            resp.is_online = False
            
    # Inject parsed properties for UI
    import re
    resp.version = contestant.agent_version or "unknown"
    if contestant.agent_fingerprint:
        resp.raw_fingerprint = contestant.agent_fingerprint
        ip_match = re.search(r'ip_address:\s*"([^"]+)"', contestant.agent_fingerprint)
        if ip_match:
            resp.ip = ip_match.group(1)
        os_match = re.search(r'os:\s*"([^"]+)"', contestant.agent_fingerprint)
        if os_match:
            resp.os = os_match.group(1).upper()
            
    resp.status = "ONLINE" if resp.is_online else "OFFLINE"
            
    score = await ContestantService.get_latest_score(db, contestant_id)
    if score:
        resp.latest_score = score.score
        resp.latest_level = score.level
        if resp.is_online and resp.latest_level in ["ELEVATED", "CRITICAL", "YELLOW", "RED"]:
            resp.status = "WARNING"
            
    # Inject latest resource metrics
    from app.models import ResourceSnapshot
    from sqlalchemy import select
    res_query = await db.execute(
        select(ResourceSnapshot)
        .where(ResourceSnapshot.contestant_id == contestant_id)
        .order_by(ResourceSnapshot.ts.desc())
        .limit(1)
    )
    latest_res = res_query.scalar_one_or_none()
    if latest_res:
        resp.cpu = round(latest_res.cpu_pct or 0.0, 1)
        resp.ram = round(latest_res.ram_pct or 0.0, 1)
        
    return resp


from pydantic import BaseModel
class ContestantUpdateBody(BaseModel):
    handle: str | None = None
    team: str | None = None


@router.patch("/{contestant_id}", response_model=ContestantResponse)
async def update_contestant(
    contestant_id: UUID,
    body: ContestantUpdateBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update contestant handle/team."""
    update_data = body.model_dump(exclude_unset=True)
    contestant = await ContestantService.update(db, contestant_id, **update_data)
    if not contestant:
        raise HTTPException(status_code=404, detail="Contestant not found")
    return ContestantResponse.model_validate(contestant)


@router.delete("/{contestant_id}", response_model=MessageResponse)
async def delete_contestant(
    contestant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Delete a contestant."""
    success = await ContestantService.delete(db, contestant_id)
    if not success:
        raise HTTPException(status_code=404, detail="Contestant not found")
    return MessageResponse(message="Contestant deleted successfully")


@router.post("/{contestant_id}/warning", response_model=MessageResponse)
async def send_warning(
    contestant_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Queue a screen-lock warning payload for the contestant's agent."""
    from app.services.telemetry import TelemetryService, IncidentService
    contestant = await ContestantService.get_by_id(db, contestant_id)
    if not contestant:
        raise HTTPException(status_code=404, detail="Contestant not found")
        
    TelemetryService.queue_warning(str(contestant_id))
    
    # Increment count
    contestant.screen_lock_count += 1
    
    # Create incident for tracking
    await IncidentService.create_incident(
        db, contestant_id, indicator_type="SCREEN_LOCK_ISSUED", evidence="Screen-Lock Warning deployed by proctor."
    )
    
    await db.commit()
    
    # Broadcast contestant update
    from app.ws.manager import ws_manager
    from app.schemas import ContestantResponse
    resp = ContestantResponse.model_validate(contestant)
    await ws_manager.send_contestant_update(str(contestant.competition_id), resp.model_dump(mode='json'))
    
    return MessageResponse(message="Warning payload queued successfully")


@router.get("/{contestant_id}/scores", response_model=List[IntegrityScoreResponse])
async def get_contestant_scores(
    contestant_id: UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get integrity score history for a contestant."""
    from sqlalchemy import select
    from app.models import IntegrityScore

    result = await db.execute(
        select(IntegrityScore)
        .where(IntegrityScore.contestant_id == contestant_id)
        .order_by(IntegrityScore.calculated_at.desc())
        .limit(limit)
    )
    scores = result.scalars().all()
    return [IntegrityScoreResponse.model_validate(s) for s in scores]


@router.get("/{contestant_id}/incidents", response_model=List[IncidentResponse])
async def get_contestant_incidents(
    contestant_id: UUID,
    status_filter: str = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get incidents for a contestant."""
    incidents = await IncidentService.list_by_contestant(
        db, contestant_id, status_filter
    )
    return [IncidentResponse.model_validate(i) for i in incidents]


@router.get("/{contestant_id}/resources")
async def get_contestant_resources(
    contestant_id: UUID,
    limit: int = 30,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models import ResourceSnapshot
    
    result = await db.execute(
        select(ResourceSnapshot)
        .where(ResourceSnapshot.contestant_id == contestant_id)
        .order_by(ResourceSnapshot.ts.desc())
        .limit(limit)
    )
    snapshots = result.scalars().all()
    # Format for chart
    data = []
    for s in reversed(snapshots): # Chart needs chronological order
        data.append({
            "time": s.ts.strftime("%I:%M %p"),
            "cpu": s.cpu_pct or 0.0,
            "ram": s.ram_pct or 0.0,
            "gpu": s.gpu_pct or 0.0,
        })
    return data

@router.get("/{contestant_id}/activity")
async def get_contestant_activity(
    contestant_id: UUID,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    from sqlalchemy import select
    from app.models import ProcessLog, NetworkLog, Incident, Heartbeat
    
    # Incidents
    inc_res = await db.execute(select(Incident).where(Incident.contestant_id == contestant_id).order_by(Incident.detected_at.desc()).limit(limit))
    incidents = inc_res.scalars().all()
    
    # Processes
    proc_res = await db.execute(select(ProcessLog).where(ProcessLog.contestant_id == contestant_id).order_by(ProcessLog.ts.desc()).limit(limit))
    processes = proc_res.scalars().all()
    
    # Network
    net_res = await db.execute(select(NetworkLog).where(NetworkLog.contestant_id == contestant_id).order_by(NetworkLog.ts.desc()).limit(limit))
    networks = net_res.scalars().all()
    
    # Heartbeat
    hb_res = await db.execute(select(Heartbeat).where(Heartbeat.contestant_id == contestant_id).order_by(Heartbeat.ts.desc()).limit(limit))
    heartbeats = hb_res.scalars().all()
    
    activities = []
    
    for i in incidents:
        activities.append({
            "ts": i.detected_at,
            "type": "ESCALATE",
            "color": "#f43f5e", 
            "text": f"Auto-escalated to INCIDENT #{str(i.id)[:8].upper()}",
            "detail": f"{i.indicator_type}",
        })
        
    for p in processes:
        if p.category != "NORMAL":
            activities.append({
                "ts": p.ts,
                "type": "PROCESS",
                "color": "#f43f5e", 
                "text": f"Process detected: {p.process_name} (PID {p.pid})",
                "detail": f"{p.category}",
            })
            
    for n in networks:
        if n.verdict != "SAFE":
            activities.append({
                "ts": n.ts,
                "type": "NETWORK",
                "color": "#38bdf8",
                "text": f"Connection: {n.dst_domain or n.dst_ip}",
                "detail": f"{n.verdict}",
            })
        
    for h in heartbeats:
        activities.append({
            "ts": h.ts,
            "type": "SYSTEM",
            "color": "#10b981", 
            "text": "Agent heartbeat received",
            "detail": f"v{h.agent_version}",
        })
        
    activities.sort(key=lambda x: x["ts"], reverse=True)
    
    formatted = []
    for a in activities[:limit]:
        formatted.append({
            "time": a["ts"].strftime("%I:%M:%S"),
            "type": a["type"],
            "color": a["color"],
            "text": a["text"],
            "detail": a["detail"],
        })
        
    return formatted


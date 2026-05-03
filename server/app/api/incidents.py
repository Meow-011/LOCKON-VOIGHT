"""
Incident management API — View, review, and dismiss incidents.
"""

from uuid import UUID
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.services.telemetry import IncidentService
from app.schemas import IncidentResponse, IncidentReview, MessageResponse

router = APIRouter()


@router.get("/", response_model=List[IncidentResponse])
async def list_incidents(
    competition_id: Optional[UUID] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    List incidents. Optionally filter by competition and status.
    """
    from sqlalchemy import select
    from app.models import Incident, Contestant
    
    if competition_id:
        query = (
            select(Incident, Contestant)
            .join(Contestant, Incident.contestant_id == Contestant.id)
            .where(Contestant.competition_id == competition_id)
            .order_by(Incident.detected_at.desc())
            .limit(limit)
        )
    else:
        # List all incidents (limited)
        query = (
            select(Incident, Contestant)
            .outerjoin(Contestant, Incident.contestant_id == Contestant.id)
            .order_by(Incident.detected_at.desc())
            .limit(limit)
        )

    if status_filter:
        query = query.where(Incident.status == status_filter)
        
    result = await db.execute(query)
    rows = result.all()
    
    responses = []
    for incident, contestant in rows:
        resp = IncidentResponse.model_validate(incident)
        if contestant:
            resp.target = f"[{contestant.team}] {contestant.handle}" if contestant.team else contestant.handle
        responses.append(resp)

    return responses

@router.get("/matrix", response_model=list)
async def threat_matrix(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get incident counts grouped by indicator_type for the Threat Matrix."""
    from sqlalchemy import select, func
    from app.models import Incident

    query = (
        select(
            Incident.indicator_type.label('label'),
            func.count().label('val'),
        )
        .where(Incident.status != 'DISMISSED')
        .group_by(Incident.indicator_type)
        .order_by(func.count().desc())
        .limit(5)
    )
    result = await db.execute(query)
    rows = result.all()
    
    # Map raw types to display names if needed
    type_map = {
        "LOCAL_LLM": "LOCAL LLM",
        "AI_EDITOR": "AI EXTENSION",
        "NETWORK": "PROXY/VPN",
        "RESOURCE": "MEMORY INJ",
        "TAMPER": "TAMPERING",
        "PROCESS": "PROCESS",
        "FILE": "MODEL FILE"
    }
    
    data = []
    for r in rows:
        label = type_map.get(r.label, r.label.replace('_', ' ').upper()[:12])
        data.append({"label": label, "val": r.val})
        
    return data

@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get a single incident with full details."""
    from sqlalchemy import select
    from app.models import Incident, Contestant

    query = (
        select(Incident, Contestant)
        .outerjoin(Contestant, Incident.contestant_id == Contestant.id)
        .where(Incident.id == incident_id)
    )
    result = await db.execute(query)
    row = result.first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    incident, contestant = row
    resp = IncidentResponse.model_validate(incident)
    if contestant:
        resp.target = f"[{contestant.team}] {contestant.handle}" if contestant.team else contestant.handle
    return resp


@router.patch("/{incident_id}/review", response_model=IncidentResponse)
async def review_incident(
    incident_id: UUID,
    body: IncidentReview,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Review or dismiss an incident."""
    incident = await IncidentService.review(
        db,
        incident_id=incident_id,
        status=body.status,
        reviewed_by=current_user["username"],
        note=body.review_note,
    )
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    # Recalculate score after review
    await IncidentService.recalculate_score(db, incident.contestant_id)

    return IncidentResponse.model_validate(incident)


@router.get("/trend/hourly", response_model=list)
async def incident_trend(
    hours: int = Query(24, le=168),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get hourly incident counts for the specified time range."""
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select, func, case
    from app.models import Incident

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    hour_expr = func.date_trunc('hour', Incident.detected_at)
    
    query = (
        select(
            hour_expr.label('hour'),
            func.count().label('total'),
            func.sum(case((Incident.status == 'OPEN', 1), else_=0)).label('escalated'),
        )
        .where(Incident.detected_at >= cutoff)
        .group_by(hour_expr)
        .order_by(hour_expr)
    )
    result = await db.execute(query)
    rows = result.all()
    return [{"hour": str(r.hour), "total": r.total, "escalated": int(r.escalated or 0)} for r in rows]


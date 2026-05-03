"""
Competition management API — Full CRUD with contestant management.
"""

from uuid import UUID
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
import os
import uuid

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user, require_admin
from app.services.competition import CompetitionService, ContestantService
from app.schemas import (
    CompetitionCreate, CompetitionUpdate, CompetitionResponse,
    ContestantCreate, ContestantResponse,
    MessageResponse,
)

router = APIRouter()


# ──────────────────────────────────────────────
# Competition CRUD
# ──────────────────────────────────────────────

@router.get("/", response_model=List[CompetitionResponse])
async def list_competitions(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all competitions."""
    comps = await CompetitionService.list_all(db, status_filter)
    results = []
    for comp in comps:
        count = await CompetitionService.get_contestant_count(db, comp.id)
        resp = CompetitionResponse.model_validate(comp)
        resp.contestant_count = count
        results.append(resp)
    return results


@router.post("/", response_model=CompetitionResponse, status_code=status.HTTP_201_CREATED)
async def create_competition(
    body: CompetitionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new competition."""
    comp = await CompetitionService.create(
        db, name=body.name, description=body.description, banner=body.banner,
        start_time=body.start_time, end_time=body.end_time,
    )
    resp = CompetitionResponse.model_validate(comp)
    resp.contestant_count = 0
    return resp


ALLOWED_BANNER_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp"}
MAX_BANNER_SIZE = 10 * 1024 * 1024  # 10 MB

@router.post("/upload-banner", response_model=dict)
async def upload_banner(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """Upload a custom banner image."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_BANNER_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {', '.join(ALLOWED_BANNER_EXTENSIONS)}")
    
    content = await file.read()
    if len(content) > MAX_BANNER_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
    
    try:
        os.makedirs("uploads/banners", exist_ok=True)
        filename = f"{uuid.uuid4()}.{ext}"
        filepath = os.path.join("uploads", "banners", filename)
        
        with open(filepath, "wb") as f:
            f.write(content)
            
        return {"url": f"/uploads/banners/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to process upload")


@router.get("/{competition_id}", response_model=CompetitionResponse)
async def get_competition(
    competition_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Get competition details."""
    comp = await CompetitionService.get_by_id(db, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    count = await CompetitionService.get_contestant_count(db, comp.id)
    resp = CompetitionResponse.model_validate(comp)
    resp.contestant_count = count
    return resp


@router.patch("/{competition_id}", response_model=CompetitionResponse)
async def update_competition(
    competition_id: UUID,
    body: CompetitionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update competition details."""
    update_data = body.model_dump(exclude_unset=True)
    comp = await CompetitionService.update(db, competition_id, **update_data)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")
    count = await CompetitionService.get_contestant_count(db, comp.id)
    resp = CompetitionResponse.model_validate(comp)
    resp.contestant_count = count
    return resp


@router.delete("/{competition_id}", response_model=MessageResponse)
async def delete_competition(
    competition_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Delete a competition and all related data."""
    deleted = await CompetitionService.delete(db, competition_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Competition not found")
    return MessageResponse(message="Competition deleted successfully")


# ──────────────────────────────────────────────
# Contestants under a Competition
# ──────────────────────────────────────────────

@router.get("/{competition_id}/contestants", response_model=List[ContestantResponse])
async def list_contestants(
    competition_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all contestants in a competition."""
    comp = await CompetitionService.get_by_id(db, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")

    contestants = await ContestantService.list_by_competition(db, competition_id)
    results = []
    for c in contestants:
        resp = ContestantResponse.model_validate(c)
        
        # Dynamically compute is_online for UI since Celery worker might not be running
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
            if resp.is_online and resp.latest_level in ["ELEVATED", "CRITICAL"]:
                resp.status = "WARNING"
        results.append(resp)
    return results


@router.post("/{competition_id}/contestants", response_model=ContestantResponse,
             status_code=status.HTTP_201_CREATED)
async def add_contestant(
    competition_id: UUID,
    body: ContestantCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Add a contestant to a competition (generates enrollment token)."""
    comp = await CompetitionService.get_by_id(db, competition_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Competition not found")

    contestant = await ContestantService.create(
        db, competition_id=competition_id, handle=body.handle, team=body.team,
    )
    return ContestantResponse.model_validate(contestant)

"""
API endpoints for managing the global Detection Policy.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models import SystemPolicy
from app.schemas import SystemPolicyResponse, SystemPolicyUpdate
from app.scoring.engine import scoring_engine

router = APIRouter()

@router.get("/", response_model=SystemPolicyResponse)
async def get_policy(
    db: AsyncSession = Depends(get_db),
):
    """Get the current global detection policy."""
    result = await db.execute(select(SystemPolicy).where(SystemPolicy.id == 1))
    policy = result.scalars().first()
    
    if not policy:
        # Create default policy if it doesn't exist
        policy = SystemPolicy(
            id=1,
            domains=[],
            processes=[],
            extensions=[],
            min_file_size_mb=100,
            scan_interval=5
        )
        db.add(policy)
        await db.commit()
        await db.refresh(policy)
        
    # Update memory cache
    scoring_engine.update_dynamic_policy(policy)
        
    return policy


@router.put("/", response_model=SystemPolicyResponse)
async def update_policy(
    policy_update: SystemPolicyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Update the global detection policy."""
    result = await db.execute(select(SystemPolicy).where(SystemPolicy.id == 1))
    policy = result.scalars().first()
    
    if not policy:
        policy = SystemPolicy(id=1)
        db.add(policy)
        
    policy.domains = [d.model_dump() for d in policy_update.domains]
    policy.processes = [p.model_dump() for p in policy_update.processes]
    policy.extensions = [e.model_dump() for e in policy_update.extensions]
    policy.min_file_size_mb = policy_update.min_file_size_mb
    policy.scan_interval = policy_update.scan_interval
    
    await db.commit()
    await db.refresh(policy)
    
    # Update memory cache
    scoring_engine.update_dynamic_policy(policy)
    
    # Optional: Broadcast policy update to connected agents via WebSocket/gRPC here
    
    return policy

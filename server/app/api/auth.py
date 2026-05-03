"""
Authentication API — Proctor login, token refresh, and user management.
"""

from datetime import datetime, timezone
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, get_current_user, require_admin,
)
from app.core.config import settings
from app.models import Proctor
from app.schemas import (
    LoginRequest, TokenResponse, RefreshRequest,
    ProctorCreate, ProctorResponse, MessageResponse,
)

router = APIRouter()

# ─── Rate Limiting (in-memory) ────────────────────────────
LOGIN_ATTEMPTS = defaultdict(list)  # {ip: [timestamps]}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 60

def _check_rate_limit(request: Request):
    """Enforce rate limiting on login attempts."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    # Clean old entries
    LOGIN_ATTEMPTS[client_ip] = [t for t in LOGIN_ATTEMPTS[client_ip] if now - t < LOGIN_WINDOW_SECONDS]
    if len(LOGIN_ATTEMPTS[client_ip]) >= MAX_LOGIN_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many login attempts. Try again in {LOGIN_WINDOW_SECONDS} seconds.",
        )
    LOGIN_ATTEMPTS[client_ip].append(now)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate a proctor and return JWT tokens."""
    _check_rate_limit(request)
    
    result = await db.execute(
        select(Proctor).where(Proctor.username == body.username)
    )
    proctor = result.scalar_one_or_none()

    if not proctor or not verify_password(body.password, proctor.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    if not proctor.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    # Update last login
    proctor.last_login = datetime.now(timezone.utc)
    await db.commit()

    # Generate tokens
    token_data = {"sub": proctor.username, "role": proctor.role}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest):
    """Refresh an access token using a valid refresh token."""
    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type — expected refresh token",
        )

    token_data = {"sub": payload["sub"], "role": payload.get("role", "proctor")}
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/register", response_model=ProctorResponse)
async def register_proctor(
    body: ProctorCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Register a new proctor (admin only)."""
    # Check if username exists
    existing = await db.execute(
        select(Proctor).where(Proctor.username == body.username)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{body.username}' already exists",
        )

    proctor = Proctor(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
    )
    db.add(proctor)
    await db.commit()
    await db.refresh(proctor)
    return proctor


@router.get("/me", response_model=dict)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current authenticated user info."""
    return current_user


@router.post("/setup", response_model=MessageResponse)
async def initial_setup(body: ProctorCreate, db: AsyncSession = Depends(get_db)):
    """
    Create the initial admin account.
    Only works when no proctors exist in the database.
    """
    result = await db.execute(select(Proctor).limit(1))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Setup already completed — admin account exists",
        )

    proctor = Proctor(
        username=body.username,
        password_hash=hash_password(body.password),
        display_name=body.display_name or "Admin",
        role="admin",
    )
    db.add(proctor)
    await db.commit()

    return MessageResponse(message=f"Admin account '{body.username}' created successfully")


@router.get("/needs-setup", response_model=dict)
async def check_needs_setup(db: AsyncSession = Depends(get_db)):
    """Check if the system requires initial setup (i.e. no users exist)."""
    result = await db.execute(select(Proctor).limit(1))
    needs_setup = result.scalar_one_or_none() is None
    return {"needs_setup": needs_setup}


@router.get("/users", response_model=list[ProctorResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all proctor accounts."""
    result = await db.execute(select(Proctor).order_by(Proctor.created_at.desc()))
    return result.scalars().all()


class UserUpdateBody(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}", response_model=ProctorResponse)
async def update_user(
    user_id: str,
    body: UserUpdateBody,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Update a proctor's role or active status (admin only)."""
    from uuid import UUID as PyUUID
    result = await db.execute(select(Proctor).where(Proctor.id == PyUUID(user_id)))
    proctor = result.scalar_one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="User not found")
    if body.role is not None:
        proctor.role = body.role
    if body.is_active is not None:
        proctor.is_active = body.is_active
    await db.commit()
    await db.refresh(proctor)
    return proctor

@router.delete("/users/{user_id}", response_model=MessageResponse)
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    """Delete a proctor account (admin only)."""
    from uuid import UUID as PyUUID
    result = await db.execute(select(Proctor).where(Proctor.id == PyUUID(user_id)))
    proctor = result.scalar_one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="User not found")
    if proctor.username == current_user["username"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    await db.delete(proctor)
    await db.commit()
    return MessageResponse(message="User deleted successfully")


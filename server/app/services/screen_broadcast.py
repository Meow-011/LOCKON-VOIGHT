"""
Screen Broadcast Service — Manages in-memory screenshot storage.
Agents upload periodic screenshots which Proctors can view from the Dashboard.
"""

import logging
import time
from typing import Optional, Dict
from threading import Lock
from fastapi import APIRouter, Response, Depends, HTTPException, Request
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class ScreenStore:
    """Thread-safe in-memory store for the latest screenshot per contestant."""

    def __init__(self, max_entries: int = 500):
        self._lock = Lock()
        self._store: Dict[str, dict] = {}
        self._max_entries = max_entries

    def update(self, contestant_id: str, image_data: bytes, content_type: str = "image/jpeg"):
        """Store (or replace) the latest screenshot for a contestant."""
        with self._lock:
            self._store[contestant_id] = {
                "image_data": image_data,
                "content_type": content_type,
                "timestamp": time.time(),
            }
            # Evict oldest if we exceed max
            if len(self._store) > self._max_entries:
                oldest_key = min(self._store, key=lambda k: self._store[k]["timestamp"])
                del self._store[oldest_key]

    def get(self, contestant_id: str) -> Optional[dict]:
        """Get the latest screenshot for a contestant."""
        with self._lock:
            return self._store.get(contestant_id)

    def list_available(self) -> list:
        """List contestant IDs that have screenshots available."""
        with self._lock:
            return [
                {
                    "contestant_id": k,
                    "timestamp": v["timestamp"],
                    "size_bytes": len(v["image_data"]),
                }
                for k, v in self._store.items()
            ]


# Singleton instance
screen_store = ScreenStore()


# ─── REST API Endpoints ──────────────────────────────────────

@router.get("/{contestant_id}")
async def get_screenshot(contestant_id: str, current_user: dict = Depends(get_current_user)):
    """Get the latest screenshot for a contestant. Returns JPEG image."""
    entry = screen_store.get(contestant_id)
    if not entry:
        raise HTTPException(status_code=404, detail="No screenshot available for this contestant.")

    return Response(
        content=entry["image_data"],
        media_type=entry["content_type"],
        headers={
            "X-Screenshot-Timestamp": str(entry["timestamp"]),
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    )


@router.get("/")
async def list_screenshots(current_user: dict = Depends(get_current_user)):
    """List all contestants with available screenshots."""
    return screen_store.list_available()


@router.post("/upload/{contestant_id}")
async def upload_screenshot(contestant_id: str, request: Request):
    """Agent uploads a screenshot (raw JPEG bytes in request body).
    This endpoint does NOT require authentication so agents can post directly."""
    body = await request.body()
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Empty request body.")
    if len(body) > 2 * 1024 * 1024:  # Max 2MB per screenshot
        raise HTTPException(status_code=413, detail="Screenshot too large (max 2MB).")

    screen_store.update(contestant_id, body)
    logger.debug(f"[Screen] Received screenshot for {contestant_id} ({len(body)} bytes)")
    return {"status": "ok"}

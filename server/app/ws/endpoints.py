"""
WebSocket endpoints for real-time Proctor Dashboard communication.
"""

from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.config import settings
from app.ws.manager import ConnectionManager

router = APIRouter()

# Singleton connection manager
ws_manager = ConnectionManager()


def get_ws_manager() -> ConnectionManager:
    """Get the WebSocket connection manager singleton."""
    return ws_manager


@router.websocket("/ws/{competition_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    competition_id: str,
    token: str = Query(None),
):
    """
    WebSocket endpoint for real-time dashboard updates.

    Connect with: ws://server/ws/{competition_id}?token=<jwt_token>

    Message types sent to client:
    - contestant_update: Status/score changes for a contestant
    - incident_alert: New incident detected
    - heartbeat_status: Agent online/offline changes
    """
    # Accept connection first to avoid protocol errors on early close
    await websocket.accept()

    # Validate JWT token (from query parameter since WebSocket doesn't support headers well)
    if token:
        try:
            payload = decode_token(token)
            if payload.get("type") != "access":
                await websocket.close(code=4001, reason="Invalid token type")
                return
        except Exception:
            await websocket.close(code=4001, reason="Invalid or expired token")
            return
    else:
        # Only allow unauthenticated connections in development
        if settings.ENVIRONMENT != "development":
            await websocket.close(code=4001, reason="Authentication required")
            return

    await ws_manager.connect(websocket, competition_id)

    try:
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connection_established",
            "competition_id": competition_id,
            "message": "Connected to VOIGHT real-time feed",
        })

        # Keep connection alive and handle incoming messages
        while True:
            data = await websocket.receive_json()

            # Handle ping/pong for keep-alive
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, competition_id)
    except Exception:
        ws_manager.disconnect(websocket, competition_id)

"""
WebSocket connection manager for real-time Proctor Dashboard updates.
"""

from fastapi import WebSocket
from typing import Dict, Set
import json


class ConnectionManager:
    """Manages WebSocket connections from Proctor Dashboard clients."""

    def __init__(self):
        # Active connections: {competition_id: set of websockets}
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, competition_id: str):
        """Register a WebSocket connection for a competition."""
        if competition_id not in self.active_connections:
            self.active_connections[competition_id] = set()
        self.active_connections[competition_id].add(websocket)

    def disconnect(self, websocket: WebSocket, competition_id: str):
        """Remove a WebSocket connection."""
        if competition_id in self.active_connections:
            self.active_connections[competition_id].discard(websocket)
            if not self.active_connections[competition_id]:
                del self.active_connections[competition_id]

    async def broadcast_to_competition(self, competition_id: str, message: dict):
        """Broadcast a message to all proctors watching a competition."""
        if competition_id in self.active_connections:
            dead_connections = set()
            for connection in self.active_connections[competition_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    dead_connections.add(connection)
            # Clean up dead connections
            for conn in dead_connections:
                self.active_connections[competition_id].discard(conn)

    async def send_contestant_update(self, competition_id: str, contestant_id: str, data: dict):
        """Send a contestant status update to all watching proctors."""
        message = {
            "type": "contestant_update",
            "contestant_id": contestant_id,
            "data": data,
        }
        await self.broadcast_to_competition(competition_id, message)

    async def send_incident_alert(self, competition_id: str, incident: dict):
        """Send an incident alert to all watching proctors."""
        message = {
            "type": "incident_alert",
            "incident": incident,
        }
        await self.broadcast_to_competition(competition_id, message)

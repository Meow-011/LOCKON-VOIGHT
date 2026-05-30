"""
SQLAlchemy models for LOCKON VOIGHT database schema.

Models are organized by domain:
- core.py:      Competition, Contestant, IntegrityScore, Incident
- telemetry.py: ProcessLog, NetworkLog, ResourceSnapshot, Heartbeat
- auth.py:      Proctor, SystemPolicy

All models are re-exported here for backward compatibility.
"""

# Core domain models
from app.models.core import (
    Competition,
    Contestant,
    IntegrityScore,
    Incident,
)

# Time-series telemetry models (TimescaleDB hypertables)
from app.models.telemetry import (
    ProcessLog,
    NetworkLog,
    ResourceSnapshot,
    Heartbeat,
)

# Auth & policy models
from app.models.auth import (
    Proctor,
    SystemPolicy,
)

__all__ = [
    # Core
    "Competition",
    "Contestant",
    "IntegrityScore",
    "Incident",
    # Telemetry
    "ProcessLog",
    "NetworkLog",
    "ResourceSnapshot",
    "Heartbeat",
    # Auth
    "Proctor",
    "SystemPolicy",
]

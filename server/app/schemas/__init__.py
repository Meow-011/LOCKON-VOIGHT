"""
Pydantic schemas for API request/response models.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Authentication
# ──────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


# ──────────────────────────────────────────────
# Proctor
# ──────────────────────────────────────────────

class ProctorCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6)
    display_name: Optional[str] = None
    role: str = Field(default="proctor", pattern="^(admin|proctor)$")


class ProctorResponse(BaseModel):
    id: UUID
    username: str
    display_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Competition
# ──────────────────────────────────────────────

class CompetitionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    banner: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class CompetitionUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|active|completed|archived)$")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class CompetitionResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    banner: Optional[str]
    status: str
    join_code: Optional[str]
    start_time: Optional[datetime]
    end_time: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    contestant_count: int = 0

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Contestant
# ──────────────────────────────────────────────

class ContestantCreate(BaseModel):
    handle: str = Field(..., min_length=1, max_length=100)
    team: Optional[str] = Field(None, max_length=100)


class ContestantResponse(BaseModel):
    id: UUID
    competition_id: UUID
    handle: str
    team: Optional[str]
    enrollment_token: Optional[str]
    is_enrolled: bool
    enrolled_at: Optional[datetime]
    last_seen: Optional[datetime]
    is_online: bool
    screen_lock_count: int = 0
    created_at: datetime
    latest_score: Optional[int] = None
    latest_level: Optional[str] = None
    
    # UI specific mapped fields
    version: Optional[str] = "unknown"
    ip: Optional[str] = "unknown"
    os: Optional[str] = "unknown"
    cpu: Optional[float] = 0.0
    ram: Optional[float] = 0.0
    status: Optional[str] = "OFFLINE"
    raw_fingerprint: Optional[str] = ""

    class Config:
        from_attributes = True


class EnrollmentRequest(BaseModel):
    enrollment_token: str
    agent_fingerprint: str
    agent_version: str


class EnrollmentResponse(BaseModel):
    agent_id: str
    contestant_id: UUID
    competition_id: UUID
    config: dict


# ──────────────────────────────────────────────
# Incident
# ──────────────────────────────────────────────

class IncidentResponse(BaseModel):
    id: UUID
    contestant_id: UUID
    target: Optional[str] = None
    indicator_type: str
    weight: int
    evidence: Optional[str]
    status: str
    reviewed_by: Optional[str]
    review_note: Optional[str]
    detected_at: datetime
    reviewed_at: Optional[datetime]

    class Config:
        from_attributes = True


class IncidentReview(BaseModel):
    status: str = Field(..., pattern="^(REVIEWED|DISMISSED)$")
    review_note: Optional[str] = None


# ──────────────────────────────────────────────
# Telemetry (from Agent)
# ──────────────────────────────────────────────

class ProcessEntry(BaseModel):
    name: str
    pid: int
    cmdline: Optional[str] = ""
    cpu_percent: float = 0.0
    memory_mb: float = 0.0
    category: str = "NORMAL"


class ProcessTelemetry(BaseModel):
    contestant_id: UUID
    processes: List[ProcessEntry]


class NetworkEventTelemetry(BaseModel):
    contestant_id: UUID
    dst_domain: Optional[str] = ""
    dst_ip: str
    dst_port: int
    protocol: str = "TCP"
    verdict: str = "UNKNOWN"


class ResourceTelemetry(BaseModel):
    contestant_id: UUID
    cpu_percent: float = 0.0
    ram_percent: float = 0.0
    gpu_percent: float = 0.0
    vram_mb: float = 0.0


class FileAlertTelemetry(BaseModel):
    contestant_id: UUID
    file_path: str
    file_name: str
    file_size_bytes: int
    file_type: str


class HeartbeatTelemetry(BaseModel):
    contestant_id: UUID
    agent_version: str
    agent_binary_hash: str


# ──────────────────────────────────────────────
# Integrity Score
# ──────────────────────────────────────────────

class IntegrityScoreResponse(BaseModel):
    id: UUID
    contestant_id: UUID
    score: int
    level: str
    breakdown: Optional[dict]
    calculated_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Generic
# ──────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str
    success: bool = True

# ──────────────────────────────────────────────
# System Detection Policy
# ──────────────────────────────────────────────

class PolicyDomainRule(BaseModel):
    domain: str
    category: str
    action: str

class PolicyProcessRule(BaseModel):
    name: str
    category: str
    action: str

class PolicyExtensionRule(BaseModel):
    ext: str
    desc: str
    action: str

class SystemPolicyBase(BaseModel):
    domains: List[PolicyDomainRule] = []
    processes: List[PolicyProcessRule] = []
    extensions: List[PolicyExtensionRule] = []
    min_file_size_mb: int = 100
    scan_interval: int = 5

class SystemPolicyUpdate(SystemPolicyBase):
    pass

class SystemPolicyResponse(SystemPolicyBase):
    id: int
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

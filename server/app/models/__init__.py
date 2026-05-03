"""
SQLAlchemy models for LOCKON VOIGHT database schema.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text,
    ForeignKey, Index, JSON, BigInteger
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


# ──────────────────────────────────────────────
# Core Tables (PostgreSQL)
# ──────────────────────────────────────────────

class Competition(Base):
    """A competition event (CTF, exam, assessment)."""
    __tablename__ = "competitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    banner = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="draft")  # draft, active, completed, archived
    start_time = Column(DateTime(timezone=True), nullable=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    contestants = relationship("Contestant", back_populates="competition", cascade="all, delete-orphan")


class Contestant(Base):
    """A participant in a competition."""
    __tablename__ = "contestants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    competition_id = Column(UUID(as_uuid=True), ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False)
    handle = Column(String(100), nullable=False)
    team = Column(String(100), nullable=True)
    enrollment_token = Column(String(255), nullable=True, unique=True)
    agent_fingerprint = Column(String(512), nullable=True)
    agent_version = Column(String(50), nullable=True)
    is_enrolled = Column(Boolean, default=False)
    enrolled_at = Column(DateTime(timezone=True), nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    is_online = Column(Boolean, default=False)
    screen_lock_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    competition = relationship("Competition", back_populates="contestants")
    integrity_scores = relationship("IntegrityScore", back_populates="contestant", cascade="all, delete-orphan")
    incidents = relationship("Incident", back_populates="contestant", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_contestants_competition_id", "competition_id"),
        Index("ix_contestants_enrollment_token", "enrollment_token"),
    )


class IntegrityScore(Base):
    """Calculated integrity score for a contestant."""
    __tablename__ = "integrity_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=False, default=0)
    level = Column(String(10), nullable=False, default="GREEN")  # GREEN, YELLOW, RED
    breakdown = Column(JSON, nullable=True)  # Detailed scoring breakdown
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    contestant = relationship("Contestant", back_populates="integrity_scores")

    __table_args__ = (
        Index("ix_integrity_scores_contestant_id", "contestant_id"),
        Index("ix_integrity_scores_calculated_at", "calculated_at"),
    )


class Incident(Base):
    """An alert triggered when IoA (Indicator of AI) is detected."""
    __tablename__ = "incidents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    indicator_type = Column(String(50), nullable=False)  # AI_EDITOR, LOCAL_LLM, NETWORK, RESOURCE, TAMPER, etc.
    weight = Column(Integer, nullable=False)
    evidence = Column(Text, nullable=True)  # JSON string with details
    status = Column(String(20), nullable=False, default="OPEN")  # OPEN, REVIEWED, DISMISSED
    reviewed_by = Column(String(100), nullable=True)
    review_note = Column(Text, nullable=True)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    contestant = relationship("Contestant", back_populates="incidents")

    __table_args__ = (
        Index("ix_incidents_contestant_id", "contestant_id"),
        Index("ix_incidents_status", "status"),
        Index("ix_incidents_detected_at", "detected_at"),
    )


# ──────────────────────────────────────────────
# Time-Series Tables (TimescaleDB Hypertables)
# ──────────────────────────────────────────────

class ProcessLog(Base):
    """Process monitoring log from agent."""
    __tablename__ = "process_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    process_name = Column(String(255), nullable=False)
    pid = Column(Integer, nullable=False)
    cmdline = Column(Text, nullable=True)
    cpu_pct = Column(Float, nullable=True)
    mem_mb = Column(Float, nullable=True)
    category = Column(String(50), nullable=False, default="NORMAL")  # AI_EDITOR, LOCAL_LLM, AI_AGENT, NORMAL

    __table_args__ = (
        Index("ix_process_logs_contestant_ts", "contestant_id", "ts"),
    )


class NetworkLog(Base):
    """Network connection log from agent."""
    __tablename__ = "network_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    dst_domain = Column(String(255), nullable=True)
    dst_ip = Column(String(45), nullable=True)
    dst_port = Column(Integer, nullable=True)
    protocol = Column(String(10), nullable=True)  # TCP, UDP, DNS
    verdict = Column(String(20), nullable=False, default="UNKNOWN")  # AI_SERVICE, SAFE, UNKNOWN

    __table_args__ = (
        Index("ix_network_logs_contestant_ts", "contestant_id", "ts"),
    )


class ResourceSnapshot(Base):
    """System resource usage snapshot from agent."""
    __tablename__ = "resource_snapshots"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    cpu_pct = Column(Float, nullable=True)
    ram_pct = Column(Float, nullable=True)
    gpu_pct = Column(Float, nullable=True)
    vram_mb = Column(Float, nullable=True)

    __table_args__ = (
        Index("ix_resource_snapshots_contestant_ts", "contestant_id", "ts"),
    )


class Heartbeat(Base):
    """Agent heartbeat check-in records."""
    __tablename__ = "heartbeats"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    contestant_id = Column(UUID(as_uuid=True), ForeignKey("contestants.id", ondelete="CASCADE"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    agent_version = Column(String(50), nullable=True)
    agent_hash = Column(String(128), nullable=True)  # SHA-256 of agent binary

    __table_args__ = (
        Index("ix_heartbeats_contestant_ts", "contestant_id", "ts"),
    )


# ──────────────────────────────────────────────
# Proctor / Auth Tables
# ──────────────────────────────────────────────

class Proctor(Base):
    """A proctor/admin who can access the dashboard."""
    __tablename__ = "proctors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(100), nullable=False, unique=True)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(100), nullable=True)
    role = Column(String(20), nullable=False, default="proctor")  # admin, proctor
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)

class SystemPolicy(Base):
    """Global detection policy rules for all agents."""
    __tablename__ = "system_policy"

    id = Column(Integer, primary_key=True, default=1)
    domains = Column(JSON, nullable=False, default=list)
    processes = Column(JSON, nullable=False, default=list)
    extensions = Column(JSON, nullable=False, default=list)
    min_file_size_mb = Column(Integer, nullable=False, default=100)
    scan_interval = Column(Integer, nullable=False, default=5)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

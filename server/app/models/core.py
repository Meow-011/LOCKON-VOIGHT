"""
Core domain models — Competition, Contestant, IntegrityScore, Incident.
"""

import uuid
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text,
    ForeignKey, Index, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.core.database import Base


class Competition(Base):
    """A competition event (CTF, exam, assessment)."""
    __tablename__ = "competitions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    banner = Column(String(255), nullable=True)
    join_code = Column(String(20), unique=True, index=True, nullable=True)
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

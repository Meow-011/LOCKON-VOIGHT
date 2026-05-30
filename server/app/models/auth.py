"""
Authentication & policy models — Proctor, SystemPolicy.
"""

import uuid
from sqlalchemy import (
    Column, String, Integer, Boolean, DateTime, JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


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

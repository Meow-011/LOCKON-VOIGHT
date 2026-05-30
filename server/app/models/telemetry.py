"""
Time-series telemetry models — ProcessLog, NetworkLog, ResourceSnapshot, Heartbeat.
These map to TimescaleDB hypertables in production.
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Text,
    ForeignKey, Index, BigInteger,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


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

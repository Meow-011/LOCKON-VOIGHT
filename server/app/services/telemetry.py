"""
Telemetry ingestion & Incident management service.
Processes incoming telemetry data from agents and generates incidents.
"""

import uuid
import json
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    ProcessLog, NetworkLog, ResourceSnapshot,
    Heartbeat, Incident, IntegrityScore, Contestant,
)
from app.scoring.engine import scoring_engine


class TelemetryService:
    """Processes incoming telemetry data from agents."""
    
    pending_warnings: Dict[str, bool] = {}
    pending_disconnects: Dict[str, bool] = {}

    @classmethod
    def queue_warning(cls, contestant_id: str):
        cls.pending_warnings[str(contestant_id)] = True
        
    @classmethod
    def consume_warning(cls, contestant_id: str) -> bool:
        cid = str(contestant_id)
        if cls.pending_warnings.get(cid):
            cls.pending_warnings[cid] = False
            return True
        return False

    @classmethod
    def queue_disconnect(cls, contestant_id: str):
        cls.pending_disconnects[str(contestant_id)] = True

    @classmethod
    def consume_disconnect(cls, contestant_id: str) -> bool:
        cid = str(contestant_id)
        if cls.pending_disconnects.get(cid):
            cls.pending_disconnects[cid] = False
            return True
        return False

    @staticmethod
    async def ingest_processes(
        db: AsyncSession, contestant_id: uuid.UUID, processes: List[Dict]
    ) -> List[ProcessLog]:
        """Ingest process snapshot and create logs."""
        logs = []
        for proc in processes:
            log_entry = ProcessLog(
                contestant_id=contestant_id,
                process_name=proc.get("name", ""),
                pid=proc.get("pid", 0),
                cmdline=proc.get("cmdline", ""),
                cpu_pct=proc.get("cpu_percent", 0.0),
                mem_mb=proc.get("memory_mb", 0.0),
                category=proc.get("category", "NORMAL"),
            )
            db.add(log_entry)
            logs.append(log_entry)
        await db.commit()
        return logs

    @staticmethod
    async def ingest_network_event(
        db: AsyncSession, contestant_id: uuid.UUID, event: Dict
    ) -> NetworkLog:
        """Ingest a network event."""
        log_entry = NetworkLog(
            contestant_id=contestant_id,
            dst_domain=event.get("dst_domain", ""),
            dst_ip=event.get("dst_ip", ""),
            dst_port=event.get("dst_port", 0),
            protocol=event.get("protocol", "TCP"),
            verdict=event.get("verdict", "UNKNOWN"),
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        return log_entry

    @staticmethod
    async def ingest_resources(
        db: AsyncSession, contestant_id: uuid.UUID, data: Dict
    ) -> ResourceSnapshot:
        """Ingest a resource usage snapshot."""
        snapshot = ResourceSnapshot(
            contestant_id=contestant_id,
            cpu_pct=data.get("cpu_percent", 0.0),
            ram_pct=data.get("ram_percent", 0.0),
            gpu_pct=data.get("gpu_percent", 0.0),
            vram_mb=data.get("vram_mb", 0.0),
        )
        db.add(snapshot)
        await db.commit()
        await db.refresh(snapshot)
        return snapshot

    @staticmethod
    async def ingest_heartbeat(
        db: AsyncSession, contestant_id: uuid.UUID,
        agent_version: str, agent_hash: str,
    ) -> Heartbeat:
        """Record a heartbeat check-in."""
        hb = Heartbeat(
            contestant_id=contestant_id,
            agent_version=agent_version,
            agent_hash=agent_hash,
        )
        db.add(hb)
        await db.commit()
        await db.refresh(hb)
        return hb


class IncidentService:
    """Manages IoA incidents and integrity score calculation."""

    @staticmethod
    async def create_incident(
        db: AsyncSession,
        contestant_id: uuid.UUID,
        indicator_type: str,
        evidence: str = "",
    ) -> Incident:
        """Create a new incident from a detected IoA."""
        weight = scoring_engine.get_weight(indicator_type)

        incident = Incident(
            contestant_id=contestant_id,
            indicator_type=indicator_type,
            weight=weight,
            evidence=evidence,
            status="OPEN",
        )
        db.add(incident)
        await db.commit()
        await db.refresh(incident)
        return incident

    @staticmethod
    async def get_by_id(db: AsyncSession, incident_id: uuid.UUID) -> Optional[Incident]:
        result = await db.execute(
            select(Incident).where(Incident.id == incident_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_contestant(
        db: AsyncSession, contestant_id: uuid.UUID,
        status_filter: str = None,
    ) -> List[Incident]:
        query = (
            select(Incident)
            .where(Incident.contestant_id == contestant_id)
            .order_by(Incident.detected_at.desc())
        )
        if status_filter:
            query = query.where(Incident.status == status_filter)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def list_by_competition(
        db: AsyncSession, competition_id: uuid.UUID,
        status_filter: str = None, limit: int = 100,
    ) -> List[Incident]:
        query = (
            select(Incident)
            .join(Contestant, Incident.contestant_id == Contestant.id)
            .where(Contestant.competition_id == competition_id)
            .order_by(Incident.detected_at.desc())
            .limit(limit)
        )
        if status_filter:
            query = query.where(Incident.status == status_filter)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def review(
        db: AsyncSession, incident_id: uuid.UUID,
        status: str, reviewed_by: str, note: str = None,
    ) -> Optional[Incident]:
        """Review or dismiss an incident."""
        incident = await IncidentService.get_by_id(db, incident_id)
        if not incident:
            return None

        incident.status = status
        incident.reviewed_by = reviewed_by
        incident.review_note = note
        incident.reviewed_at = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(incident)
        return incident

    @staticmethod
    async def recalculate_score(
        db: AsyncSession, contestant_id: uuid.UUID,
    ) -> IntegrityScore:
        """Recalculate the integrity score based on all active incidents."""
        # Fetch all OPEN incidents
        open_incidents = await IncidentService.list_by_contestant(
            db, contestant_id, status_filter="OPEN"
        )

        # Build indicator list for scoring engine
        indicators = [
            {
                "type": incident.indicator_type,
                "detected_at": incident.detected_at,
                "details": incident.evidence,
            }
            for incident in open_incidents
        ]

        # Calculate score
        result = scoring_engine.calculate_score(indicators)

        # Check if it actually changed to prevent DB bloat
        from app.services.competition import ContestantService
        latest = await ContestantService.get_latest_score(db, contestant_id)
        if latest and latest.score == result["score"] and latest.level == result["level"]:
            return latest

        # Save new score only if it changed
        score = IntegrityScore(
            contestant_id=contestant_id,
            score=result["score"],
            level=result["level"],
            breakdown=result,
        )
        db.add(score)
        await db.commit()
        await db.refresh(score)

        return score

    @staticmethod
    async def process_telemetry_and_score(
        db: AsyncSession,
        contestant_id: uuid.UUID,
        indicator_type: str,
        evidence: str = "",
    ) -> Dict:
        """
        High-level: Create incident from telemetry → Recalculate score → Return both.
        This is the main entry point called by telemetry ingestion.
        """
        # Deduplication: Check if an OPEN incident of this type already exists
        query = select(Incident).where(
            Incident.contestant_id == contestant_id,
            Incident.indicator_type == indicator_type,
            Incident.status == "OPEN"
        )
        result = await db.execute(query)
        existing = result.scalars().first()

        if existing:
            existing.detected_at = datetime.now(timezone.utc)
            existing.evidence = evidence
            await db.commit()
            incident = existing
        else:
            incident = await IncidentService.create_incident(
                db, contestant_id, indicator_type, evidence
            )
            
        # --- AUTO SCREEN-LOCK MECHANISM ---
        # If the incident has a high weight (>=80), which matches ESCALATE, trigger auto-lock
        if incident.weight >= 80:
            TelemetryService.queue_warning(str(contestant_id))
            
            # Increment contestant lock count (only if we haven't just queued it recently to prevent spamming the DB)
            # Actually, to prevent DB spam, we check if it was already queued
            # But queue_warning is idempotent in memory. Let's increment count anyway.
            # Wait, incrementing count every 5s is bad. Let's do it only for NEW incidents, OR just queue it without incrementing if existing.
            if not existing:
                query = select(Contestant).where(Contestant.id == contestant_id)
                res = await db.execute(query)
                contestant_obj = res.scalars().first()
                if contestant_obj:
                    contestant_obj.screen_lock_count += 1
                    
                    auto_lock_incident = Incident(
                        contestant_id=contestant_id,
                        indicator_type="SCREEN_LOCK_ISSUED",
                        weight=0,
                        evidence=f"AUTO-TRIGGER: Screen-Lock deployed automatically due to {indicator_type}.",
                        status="RESOLVED",
                    )
                    db.add(auto_lock_incident)
                    await db.commit()

        # Recalculate score
        score = await IncidentService.recalculate_score(db, contestant_id)

        # Broadcast via WebSocket
        try:
            from app.ws.endpoints import ws_manager
            from app.schemas import IncidentResponse, ContestantResponse
            from app.api.contestants import ContestantService
            
            result = await db.execute(select(Contestant).where(Contestant.id == contestant_id))
            contestant = result.scalar_one_or_none()
            
            # 1. Broadcast the new Score/Contestant Update
            if contestant:
                resp_c = ContestantResponse.model_validate(contestant)
                resp_c.latest_score = score.score
                resp_c.latest_level = score.level
                
                # We use fire-and-forget for WS
                asyncio.create_task(
                    ws_manager.send_contestant_update(str(contestant.competition_id), str(contestant_id), resp_c.model_dump(mode='json'))
                )

            # 2. Broadcast the Incident Alert
            resp = IncidentResponse.model_validate(incident)
            if contestant:
                resp.target = f"[{contestant.team}] {contestant.handle}" if contestant.team else contestant.handle
                
            # Broadcast to both the specific competition and global channel
            comp_id = str(contestant.competition_id) if contestant else "unknown"
            alert_data = resp.model_dump(mode='json')
            await ws_manager.send_incident_alert(comp_id, alert_data)
            await ws_manager.send_incident_alert("global", alert_data)
        except Exception as e:
            # Silently fail if WS is not available
            import logging
            logging.error(f"Failed to broadcast incident: {e}")

        return {
            "incident": incident,
            "score": score,
        }

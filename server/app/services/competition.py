"""
Competition & Contestant service layer — business logic for CRUD operations.
"""

import secrets
import string
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Competition, Contestant, IntegrityScore


class CompetitionService:
    """Business logic for Competition management."""

    @staticmethod
    async def create(db: AsyncSession, name: str, description: str = None, banner: str = None,
                     start_time: datetime = None, end_time: datetime = None) -> Competition:
        
        # Generate an 8-character alphanumeric join code
        alphabet = string.ascii_uppercase + string.digits
        join_code = ''.join(secrets.choice(alphabet) for _ in range(8))
        
        comp = Competition(
            name=name,
            description=description,
            banner=banner,
            join_code=join_code,
            status="draft",
            start_time=start_time,
            end_time=end_time,
        )
        db.add(comp)
        await db.commit()
        await db.refresh(comp)
        return comp

    @staticmethod
    async def get_by_id(db: AsyncSession, competition_id: uuid.UUID) -> Optional[Competition]:
        result = await db.execute(
            select(Competition).where(Competition.id == competition_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_all(db: AsyncSession, status_filter: str = None) -> List[Competition]:
        query = select(Competition).order_by(Competition.created_at.desc())
        if status_filter:
            query = query.where(Competition.status == status_filter)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, competition_id: uuid.UUID, **kwargs) -> Optional[Competition]:
        comp = await CompetitionService.get_by_id(db, competition_id)
        if not comp:
            return None
            
        if "status" in kwargs and kwargs["status"] != comp.status:
            if kwargs["status"] == "active" and not comp.start_time:
                comp.start_time = datetime.now(timezone.utc)
            elif kwargs["status"] == "completed" and not comp.end_time:
                comp.end_time = datetime.now(timezone.utc)

        # Cleanup old banner if it is replaced
        if "banner" in kwargs and kwargs["banner"] != comp.banner:
            if comp.banner and comp.banner.startswith("/uploads/banners/"):
                file_path = f".{comp.banner}"
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                
        for key, value in kwargs.items():
            if value is not None and hasattr(comp, key):
                setattr(comp, key, value)
        await db.commit()
        await db.refresh(comp)
        return comp

    @staticmethod
    async def delete(db: AsyncSession, competition_id: uuid.UUID) -> bool:
        comp = await CompetitionService.get_by_id(db, competition_id)
        if not comp:
            return False
            
        # Cleanup banner file
        if comp.banner and comp.banner.startswith("/uploads/banners/"):
            file_path = f".{comp.banner}"
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass
                    
        await db.delete(comp)
        await db.commit()
        return True

    @staticmethod
    async def get_contestant_count(db: AsyncSession, competition_id: uuid.UUID) -> int:
        result = await db.execute(
            select(func.count(Contestant.id)).where(Contestant.competition_id == competition_id)
        )
        return result.scalar() or 0


class ContestantService:
    """Business logic for Contestant management."""

    @staticmethod
    def _generate_enrollment_token() -> str:
        """Generate a unique enrollment token for agent registration."""
        return f"VGT-{secrets.token_hex(16).upper()}"

    @staticmethod
    async def create(db: AsyncSession, competition_id: uuid.UUID,
                     handle: str, team: str = None) -> Contestant:
        contestant = Contestant(
            competition_id=competition_id,
            handle=handle.strip().upper() if handle else "",
            team=team.strip().upper() if team else None,
            enrollment_token=ContestantService._generate_enrollment_token(),
        )
        db.add(contestant)
        await db.commit()
        await db.refresh(contestant)
        return contestant

    @staticmethod
    async def get_by_id(db: AsyncSession, contestant_id: uuid.UUID) -> Optional[Contestant]:
        result = await db.execute(
            select(Contestant).where(Contestant.id == contestant_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_token(db: AsyncSession, token: str) -> Optional[Contestant]:
        result = await db.execute(
            select(Contestant).where(Contestant.enrollment_token == token)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_by_competition(db: AsyncSession, competition_id: uuid.UUID) -> List[Contestant]:
        result = await db.execute(
            select(Contestant)
            .where(Contestant.competition_id == competition_id)
            .order_by(Contestant.handle)
        )
        return list(result.scalars().all())

    @staticmethod
    async def update(db: AsyncSession, contestant_id: uuid.UUID, **kwargs) -> Optional[Contestant]:
        contestant = await ContestantService.get_by_id(db, contestant_id)
        if not contestant:
            return None
        for key, value in kwargs.items():
            if value is not None and hasattr(contestant, key):
                setattr(contestant, key, value)
        await db.commit()
        await db.refresh(contestant)
        return contestant

    @staticmethod
    async def delete(db: AsyncSession, contestant_id: uuid.UUID) -> bool:
        contestant = await ContestantService.get_by_id(db, contestant_id)
        if not contestant:
            return False
        await db.delete(contestant)
        await db.commit()
        return True

    @staticmethod
    async def enroll(db: AsyncSession, token: str,
                     agent_fingerprint: str, agent_version: str) -> Optional[Contestant]:
        """Enroll an agent using its token or Global Self-Enrollment (KEY::TEAM::HANDLE)."""
        contestant = None

        if "::" in token:
            parts = token.split("::")
            comp_key = parts[0].strip()
            team_name = parts[1].strip().upper()
            contestant_name = parts[2].strip().upper() if len(parts) > 2 else team_name

            # Validate Join Code!
            from app.models import Competition
            comp_result = await db.execute(
                select(Competition)
                .where(Competition.join_code == comp_key)
                .limit(1)
            )
            comp = comp_result.scalar_one_or_none()
            
            if not comp or comp.status != "active":
                return None  # Invalid join code or competition not active
                
            # Check if contestant already exists by handle and team
                

            # Check if contestant already exists by handle and team
            cont_result = await db.execute(
                select(Contestant).where(
                    Contestant.competition_id == comp.id, 
                    Contestant.handle == contestant_name,
                    Contestant.team == team_name
                )
            )
            contestant = cont_result.scalar_one_or_none()
            
            if not contestant:
                contestant = await ContestantService.create(db, competition_id=comp.id, handle=contestant_name, team=team_name)
        else:
            contestant = await ContestantService.get_by_token(db, token)

        if not contestant:
            return None
            
        if contestant.is_enrolled and "::" not in token:
            return contestant  # Already enrolled (for pre-generated tokens)

        contestant.is_enrolled = True
        contestant.enrolled_at = datetime.now(timezone.utc)
        contestant.agent_fingerprint = agent_fingerprint
        contestant.agent_version = agent_version
        contestant.is_online = True
        contestant.last_seen = datetime.now(timezone.utc)

        await db.commit()
        await db.refresh(contestant)
        return contestant

    @staticmethod
    async def update_heartbeat(db: AsyncSession, contestant_id: uuid.UUID,
                                agent_version: str = None) -> None:
        """Update last_seen and online status from heartbeat."""
        await db.execute(
            update(Contestant)
            .where(Contestant.id == contestant_id)
            .values(
                last_seen=datetime.now(timezone.utc),
                is_online=True,
                **({"agent_version": agent_version} if agent_version else {}),
            )
        )
        await db.commit()

    @staticmethod
    async def mark_offline(db: AsyncSession, contestant_id: uuid.UUID) -> None:
        """Mark a contestant as offline."""
        await db.execute(
            update(Contestant)
            .where(Contestant.id == contestant_id)
            .values(is_online=False)
        )
        await db.commit()

    @staticmethod
    async def get_latest_score(db: AsyncSession, contestant_id: uuid.UUID) -> Optional[IntegrityScore]:
        """Get the latest integrity score for a contestant."""
        result = await db.execute(
            select(IntegrityScore)
            .where(IntegrityScore.contestant_id == contestant_id)
            .order_by(IntegrityScore.calculated_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

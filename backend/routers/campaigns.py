"""
Campaign, Session, and Dungeon Map REST endpoints.

Campaign routes:
    GET    /                               List all campaigns
    POST   /                               Create a new campaign
    GET    /{campaign_id}                  Get a single campaign
    PUT    /{campaign_id}                  Update campaign name/description (auth required)
    DELETE /{campaign_id}                  Delete campaign and all related data (auth required)

Session routes:
    GET    /{campaign_id}/sessions         List sessions for a campaign
    POST   /{campaign_id}/sessions         Start a new session (auth required)
    PUT    /sessions/{session_id}/end      Mark a session as ended (auth required)

Dungeon map routes:
    GET    /{campaign_id}/map              Return the campaign's dungeon map; auto-generates
                                           one the first time it is requested.
    POST   /{campaign_id}/map/generate     Force-regenerate the dungeon map (auth required).

Authentication: write operations require the campaign's access code in the
``X-Access-Code`` request header (generated at campaign creation time and
returned in the campaign response).
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.auth import require_campaign_access, require_session_access
from backend.database import get_db
from backend.models.campaign import (
    Campaign,
    CampaignCreate,
    CampaignResponse,
    Session as GameSession,
    SessionResponse,
)
from backend.models.character import Character
from backend.services.map_generator import generate_dungeon

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _campaign_to_response(campaign: Campaign) -> CampaignResponse:
    """Convert a Campaign ORM object to a CampaignResponse Pydantic model."""
    return CampaignResponse.model_validate(campaign)


# ---------------------------------------------------------------------------
# Campaign endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[CampaignResponse])
async def list_campaigns(db: AsyncSession = Depends(get_db)):
    """Return all campaigns ordered by creation date descending."""
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.sessions))
        .order_by(Campaign.created_at.desc())
    )
    campaigns = result.scalars().all()
    return [_campaign_to_response(c) for c in campaigns]


@router.post("/", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new campaign and return it."""
    valid_rulesets = {"dnd5e", "pathfinder2e", "freeform"}
    if payload.ruleset not in valid_rulesets:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid ruleset. Must be one of: {', '.join(valid_rulesets)}",
        )

    campaign = Campaign(
        id=str(uuid.uuid4()),
        name=payload.name,
        ruleset=payload.ruleset,
        description=payload.description,
        created_at=datetime.now(timezone.utc),
        world_state="{}",
    )
    db.add(campaign)
    await db.flush()

    # Reload with sessions relationship for accurate session_count
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.sessions))
        .where(Campaign.id == campaign.id)
    )
    campaign = result.scalar_one()
    return _campaign_to_response(campaign)


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return a single campaign by ID."""
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.sessions))
        .where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )
    return _campaign_to_response(campaign)


class CampaignUpdate(BaseModel):
    """Partial-update body for a campaign (PATCH semantics).

    Only ``name`` and ``description`` may be changed after creation; the
    ruleset is immutable to avoid invalidating existing game-state data.
    """

    name: Optional[str] = None
    description: Optional[str] = None


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Update campaign name and/or description."""
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.sessions))
        .where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    if payload.name is not None:
        campaign.name = payload.name
    if payload.description is not None:
        campaign.description = payload.description

    await db.flush()

    # Reload to pick up any relationship changes
    result = await db.execute(
        select(Campaign)
        .options(selectinload(Campaign.sessions))
        .where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one()
    return _campaign_to_response(campaign)


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_campaign(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Delete a campaign and all related characters and sessions."""
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )
    await db.delete(campaign)
    await db.flush()


# ---------------------------------------------------------------------------
# Session endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/sessions", response_model=list[SessionResponse])
async def list_sessions(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return all sessions for a campaign ordered by start time descending."""
    # Ensure the campaign exists
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    if campaign_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    result = await db.execute(
        select(GameSession)
        .where(GameSession.campaign_id == campaign_id)
        .order_by(GameSession.started_at.desc())
    )
    sessions = result.scalars().all()
    return [SessionResponse.model_validate(s) for s in sessions]


@router.post(
    "/{campaign_id}/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_session(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Start a new session for the given campaign."""
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    if campaign_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    session = GameSession(
        id=str(uuid.uuid4()),
        campaign_id=campaign_id,
        started_at=datetime.now(timezone.utc),
        ended_at=None,
        messages="[]",
    )
    db.add(session)
    await db.flush()
    return SessionResponse.model_validate(session)


# ---------------------------------------------------------------------------
# Map endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/map")
async def get_map(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return the campaign dungeon map, auto-generating one if none exists yet."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    if not campaign.map_data:
        map_dict = generate_dungeon()
        campaign.map_data = json.dumps(map_dict)
        await db.flush()
        await db.commit()
    else:
        try:
            map_dict = json.loads(campaign.map_data)
        except (json.JSONDecodeError, TypeError):
            map_dict = {}

    return {"campaign_id": campaign_id, "map_data": map_dict}


@router.post("/{campaign_id}/map/generate", status_code=status.HTTP_201_CREATED)
async def generate_map(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Regenerate the dungeon map for a campaign (requires access code)."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    map_dict = generate_dungeon()
    campaign.map_data = json.dumps(map_dict)
    await db.flush()
    await db.commit()

    return {"campaign_id": campaign_id, "map_data": map_dict}


@router.get("/{campaign_id}/npcs")
async def list_npcs(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return the NPC registry for a campaign."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id!r} not found")
    try:
        npcs = json.loads(campaign.npcs or "[]")
    except (json.JSONDecodeError, TypeError):
        npcs = []
    return {"campaign_id": campaign_id, "npcs": npcs}


@router.get("/{campaign_id}/quests")
async def list_quests(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return the quest log for a campaign."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id!r} not found")
    try:
        quests = json.loads(campaign.quests or "[]")
    except (json.JSONDecodeError, TypeError):
        quests = []
    return {"campaign_id": campaign_id, "quests": quests}


@router.put("/sessions/{session_id}/end", response_model=SessionResponse)
async def end_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_session_access),
):
    """Mark a session as ended by recording the end timestamp."""
    result = await db.execute(
        select(GameSession).where(GameSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id!r} not found",
        )

    if session.ended_at is None:
        session.ended_at = datetime.now(timezone.utc)
        await db.flush()

    return SessionResponse.model_validate(session)

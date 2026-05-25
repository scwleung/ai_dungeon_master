"""
Campaign and Session REST endpoints for the AI Dungeon Master application.

Routes:
    GET    /                           List all campaigns
    POST   /                           Create a new campaign
    GET    /{campaign_id}              Get a single campaign
    PUT    /{campaign_id}              Update campaign name/description
    DELETE /{campaign_id}             Delete campaign and related data
    GET    /{campaign_id}/sessions     List sessions for a campaign
    POST   /{campaign_id}/sessions     Start a new session
    PUT    /sessions/{session_id}/end  Mark a session as ended
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

from backend.database import get_db
from backend.models.campaign import (
    Campaign,
    CampaignCreate,
    CampaignResponse,
    Session as GameSession,
    SessionResponse,
)
from backend.models.character import Character

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
    name: Optional[str] = None
    description: Optional[str] = None


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
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
async def delete_campaign(campaign_id: str, db: AsyncSession = Depends(get_db)):
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
async def start_session(campaign_id: str, db: AsyncSession = Depends(get_db)):
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


@router.put("/sessions/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: str, db: AsyncSession = Depends(get_db)):
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

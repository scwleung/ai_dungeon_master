"""
FastAPI dependency functions for campaign access-code authentication.

Write endpoints (PUT, DELETE, POST) are protected by requiring a matching
``X-Access-Code`` header.  The access code is generated when the campaign is
created and returned in the campaign response; clients must persist it and
include it in subsequent mutating requests.

Dependency functions:
    require_campaign_access   — verifies code against a campaign by campaign_id
    require_session_access    — verifies code against a campaign via session_id
    require_character_access  — verifies code against a campaign via character_id
"""

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.campaign import Campaign
from backend.models.campaign import Session as GameSession
from backend.models.character import Character


async def require_campaign_access(
    campaign_id: str,
    x_access_code: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> Campaign:
    """Raise 404 if campaign is missing, 403 if access code is wrong. Returns the Campaign."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )
    if campaign.access_code != x_access_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid access code",
        )
    return campaign


async def require_session_access(
    session_id: str,
    x_access_code: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Raise 404 if session is missing, 403 if the session's campaign code is wrong."""
    session_result = await db.execute(
        select(GameSession).where(GameSession.id == session_id)
    )
    session = session_result.scalar_one_or_none()
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session {session_id!r} not found",
        )
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == session.campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign is None or campaign.access_code != x_access_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid access code",
        )


async def require_character_access(
    character_id: str,
    x_access_code: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Raise 404 if character is missing, 403 if the character's campaign code is wrong."""
    char_result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    char = char_result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_id!r} not found",
        )
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == char.campaign_id)
    )
    campaign = campaign_result.scalar_one_or_none()
    if campaign is None or campaign.access_code != x_access_code:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid access code",
        )

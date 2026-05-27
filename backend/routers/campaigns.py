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
from backend.ws.session_hub import session_hub

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


@router.get("/{campaign_id}/map/annotations")
async def get_map_annotations(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return the campaign's map annotation pins."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    annotations = json.loads(campaign.map_annotations or "[]")
    return {"campaign_id": campaign_id, "annotations": annotations}


class AnnotationsUpdate(BaseModel):
    annotations: list[dict]


@router.put("/{campaign_id}/map/annotations")
async def update_map_annotations(
    campaign_id: str,
    payload: AnnotationsUpdate,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    """Persist map annotation pins and broadcast to active session clients."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    campaign.map_annotations = json.dumps(payload.annotations)
    await db.flush()
    # Broadcast to all active (non-ended) sessions for this campaign
    active_sessions_result = await db.execute(
        select(GameSession).where(
            GameSession.campaign_id == campaign_id,
            GameSession.ended_at.is_(None),
        )
    )
    for sess in active_sessions_result.scalars().all():
        await session_hub.broadcast(sess.id, {
            "type": "map_annotation_update",
            "annotations": payload.annotations,
        })
    return {"campaign_id": campaign_id, "annotations": payload.annotations}


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


@router.get("/sessions/{session_id}/notes")
async def get_session_notes(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the collaborative notes for a session."""
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "notes": session.notes or ""}


class SessionNotesUpdate(BaseModel):
    """Request body for updating session notes."""

    notes: str


@router.put("/sessions/{session_id}/notes")
async def update_session_notes(
    session_id: str,
    payload: SessionNotesUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Replace the collaborative notes for a session."""
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.notes = payload.notes
    db.add(session)
    await db.commit()
    return {"session_id": session_id, "notes": session.notes}


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


@router.get("/sessions/{session_id}/pins")
async def get_session_pins(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return the pinned notes for a session."""
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pins = json.loads(session.pinned_notes) if session.pinned_notes else []
    return {"session_id": session_id, "pins": pins}


class PinEntry(BaseModel):
    id: str
    text: str


class PinsUpdate(BaseModel):
    pins: list[PinEntry] = []


@router.put("/sessions/{session_id}/pins")
async def update_session_pins(
    session_id: str,
    payload: PinsUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Replace the pinned notes for a session and broadcast to all players."""
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    pins_data = [{"id": p.id, "text": p.text} for p in payload.pins]
    session.pinned_notes = json.dumps(pins_data)
    db.add(session)
    await db.commit()
    await session_hub.broadcast(session_id, {"type": "pinned_update", "pins": pins_data})
    return {"session_id": session_id, "pins": pins_data}


@router.get("/{campaign_id}/export")
async def export_campaign(
    campaign_id: str,
    campaign: Campaign = Depends(require_campaign_access),
    db: AsyncSession = Depends(get_db),
):
    """Download a full campaign bundle (campaign, characters, sessions) as JSON."""
    chars_result = await db.execute(select(Character).where(Character.campaign_id == campaign_id))
    characters = chars_result.scalars().all()

    sessions_result = await db.execute(select(GameSession).where(GameSession.campaign_id == campaign_id))
    sessions = sessions_result.scalars().all()

    def _json(s):
        try:
            return json.loads(s) if s else None
        except Exception:
            return None

    return {
        "version": 1,
        "campaign": {
            "name": campaign.name,
            "ruleset": campaign.ruleset,
            "description": campaign.description,
            "world_state": _json(campaign.world_state) or {},
            "npcs": _json(campaign.npcs) or [],
            "quests": _json(campaign.quests) or [],
            "party_state": _json(campaign.party_state) or {"gold": 0, "items": []},
        },
        "characters": [
            {
                "player_name": c.player_name,
                "name": c.name,
                "race": c.race,
                "class_name": c.class_name,
                "level": c.level,
                "hp_current": c.hp_current,
                "hp_max": c.hp_max,
                "stats": _json(c.stats) or {},
                "inventory": _json(c.inventory) or [],
                "conditions": _json(c.conditions) or [],
                "notes": c.notes,
                "spell_slots": _json(c.spell_slots),
                "resources": _json(c.resources),
            }
            for c in characters
        ],
        "sessions": [
            {
                "started_at": s.started_at.isoformat() if s.started_at else None,
                "ended_at": s.ended_at.isoformat() if s.ended_at else None,
                "session_summary": s.session_summary,
            }
            for s in sessions
        ],
    }


class CampaignImportPayload(BaseModel):
    version: int = 1
    campaign: dict
    characters: list[dict] = []
    sessions: list[dict] = []


@router.post("/import")
async def import_campaign(
    payload: CampaignImportPayload,
    db: AsyncSession = Depends(get_db),
):
    """Create a new campaign from an exported bundle. Returns the new campaign with its access code."""
    import secrets as _secrets
    new_id = str(uuid.uuid4())
    camp_data = payload.campaign
    new_campaign = Campaign(
        id=new_id,
        name=camp_data.get("name", "Imported Campaign"),
        ruleset=camp_data.get("ruleset", "dnd5e"),
        description=camp_data.get("description", ""),
        access_code=_secrets.token_urlsafe(16),
        world_state=json.dumps(camp_data.get("world_state") or {}),
        npcs=json.dumps(camp_data.get("npcs") or []),
        quests=json.dumps(camp_data.get("quests") or []),
        party_state=json.dumps(camp_data.get("party_state") or {"gold": 0, "items": []}),
    )
    db.add(new_campaign)
    await db.flush()

    for char_data in payload.characters:
        char = Character(
            id=str(uuid.uuid4()),
            campaign_id=new_id,
            player_name=char_data.get("player_name", ""),
            name=char_data.get("name", ""),
            race=char_data.get("race", ""),
            class_name=char_data.get("class_name", ""),
            level=char_data.get("level", 1),
            hp_current=char_data.get("hp_current", 10),
            hp_max=char_data.get("hp_max", 10),
            stats=json.dumps(char_data.get("stats") or {}),
            inventory=json.dumps(char_data.get("inventory") or []),
            conditions=json.dumps(char_data.get("conditions") or []),
            notes=char_data.get("notes"),
            spell_slots=json.dumps(char_data["spell_slots"]) if char_data.get("spell_slots") else None,
            resources=json.dumps(char_data["resources"]) if char_data.get("resources") else None,
        )
        db.add(char)

    await db.commit()
    await db.refresh(new_campaign)
    return {
        "id": new_campaign.id,
        "name": new_campaign.name,
        "ruleset": new_campaign.ruleset,
        "description": new_campaign.description,
        "access_code": new_campaign.access_code,
        "created_at": new_campaign.created_at.isoformat(),
    }


@router.post("/{campaign_id}/rotate-access-code")
async def rotate_access_code(
    campaign_id: str,
    campaign: Campaign = Depends(require_campaign_access),
    db: AsyncSession = Depends(get_db),
):
    """Generate a new access code for the campaign. Old code immediately becomes invalid."""
    import secrets as _secrets
    campaign.access_code = _secrets.token_urlsafe(16)
    db.add(campaign)
    await db.commit()
    return {"campaign_id": campaign_id, "access_code": campaign.access_code}


class PartyStateUpdate(BaseModel):
    gold: int = 0
    items: list[str] = []


@router.get("/{campaign_id}/party")
async def get_party_state(
    campaign_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the party's shared gold and inventory."""
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    state = json.loads(campaign.party_state) if campaign.party_state else {"gold": 0, "items": []}
    return {"campaign_id": campaign_id, **state}


@router.put("/{campaign_id}/party")
async def update_party_state(
    campaign_id: str,
    payload: PartyStateUpdate,
    campaign: Campaign = Depends(require_campaign_access),
    db: AsyncSession = Depends(get_db),
):
    """Update the party's shared gold and inventory."""
    campaign.party_state = json.dumps({"gold": payload.gold, "items": payload.items})
    db.add(campaign)
    await db.commit()
    return {"campaign_id": campaign_id, "gold": payload.gold, "items": payload.items}


# ---------------------------------------------------------------------------
# World time/weather endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/world-time")
async def get_world_time(campaign_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    time_data = json.loads(campaign.world_time or '{"day": 1, "hour": 8, "minute": 0, "weather": "clear", "temperature": "mild", "time_of_day": "morning"}')
    return {"campaign_id": campaign_id, "world_time": time_data}


class WorldTimeUpdate(BaseModel):
    day: Optional[int] = None
    hour: Optional[int] = None
    minute: Optional[int] = None
    weather: Optional[str] = None
    temperature: Optional[str] = None
    time_of_day: Optional[str] = None


@router.put("/{campaign_id}/world-time")
async def update_world_time(
    campaign_id: str,
    payload: WorldTimeUpdate,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    existing = json.loads(campaign.world_time or '{"day": 1, "hour": 8, "minute": 0, "weather": "clear", "temperature": "mild", "time_of_day": "morning"}')
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    existing.update(updates)
    if "hour" in updates and "time_of_day" not in updates:
        h = existing["hour"] % 24
        if 5 <= h < 8: existing["time_of_day"] = "dawn"
        elif 8 <= h < 12: existing["time_of_day"] = "morning"
        elif 12 <= h < 17: existing["time_of_day"] = "afternoon"
        elif 17 <= h < 20: existing["time_of_day"] = "evening"
        elif 20 <= h < 23: existing["time_of_day"] = "night"
        else: existing["time_of_day"] = "midnight"
    campaign.world_time = json.dumps(existing)
    await db.flush()
    active = await db.execute(select(GameSession).where(GameSession.campaign_id == campaign_id, GameSession.ended_at.is_(None)))
    for sess in active.scalars().all():
        await session_hub.broadcast(sess.id, {"type": "time_update", "world_time": existing})
    return {"campaign_id": campaign_id, "world_time": existing}


# ---------------------------------------------------------------------------
# Handout endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/handouts")
async def get_handouts(campaign_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    return {"campaign_id": campaign_id, "handouts": json.loads(campaign.handouts or "[]")}


class HandoutCreate(BaseModel):
    title: str
    content: str
    type: str = "text"


@router.post("/{campaign_id}/handouts")
async def create_handout(
    campaign_id: str,
    payload: HandoutCreate,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    from datetime import timezone
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    handouts = json.loads(campaign.handouts or "[]")
    new_handout = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "content": payload.content,
        "type": payload.type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    handouts.append(new_handout)
    campaign.handouts = json.dumps(handouts)
    await db.flush()
    active = await db.execute(select(GameSession).where(GameSession.campaign_id == campaign_id, GameSession.ended_at.is_(None)))
    for sess in active.scalars().all():
        await session_hub.broadcast(sess.id, {"type": "handout_push", "handout": new_handout})
    return {"campaign_id": campaign_id, "handout": new_handout}


@router.delete("/{campaign_id}/handouts/{handout_id}")
async def delete_handout(
    campaign_id: str,
    handout_id: str,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    handouts = [h for h in json.loads(campaign.handouts or "[]") if h["id"] != handout_id]
    campaign.handouts = json.dumps(handouts)
    await db.flush()
    return {"campaign_id": campaign_id, "handouts": handouts}


# ---------------------------------------------------------------------------
# Timeline endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/timeline")
async def get_timeline(campaign_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    return {"campaign_id": campaign_id, "timeline": json.loads(campaign.timeline or "[]")}


class TimelineEntryCreate(BaseModel):
    description: str
    session_tag: str = ""


@router.post("/{campaign_id}/timeline")
async def add_timeline_entry(
    campaign_id: str,
    payload: TimelineEntryCreate,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    from datetime import timezone
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    timeline = json.loads(campaign.timeline or "[]")
    entry = {
        "id": str(uuid.uuid4()),
        "description": payload.description,
        "session_tag": payload.session_tag,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    timeline.append(entry)
    campaign.timeline = json.dumps(timeline)
    await db.flush()
    return {"campaign_id": campaign_id, "entry": entry}


@router.delete("/{campaign_id}/timeline/{entry_id}")
async def delete_timeline_entry(
    campaign_id: str,
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Campaign {campaign_id!r} not found")
    timeline = [e for e in json.loads(campaign.timeline or "[]") if e["id"] != entry_id]
    campaign.timeline = json.dumps(timeline)
    await db.flush()
    return {"campaign_id": campaign_id, "timeline": timeline}


# ---------------------------------------------------------------------------
# Loot generator endpoint
# ---------------------------------------------------------------------------


class LootRequest(BaseModel):
    cr: float = 1.0
    environment: str = "dungeon"
    count: int = 5


@router.post("/{campaign_id}/loot")
async def generate_loot_endpoint(campaign_id: str, payload: LootRequest):
    """Generate treasure loot appropriate for the given CR and environment."""
    from backend.services.dm_brain import DungeonMaster
    dm_instance = DungeonMaster()
    items = await dm_instance.generate_loot(payload.cr, payload.environment, payload.count)
    return {"campaign_id": campaign_id, "items": items}

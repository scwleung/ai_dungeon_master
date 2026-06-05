"""
Campaign, Session, and Dungeon Map REST endpoints.

Campaign routes:
    GET    /                               List all campaigns (descending creation order)
    POST   /                               Create a new campaign
    GET    /{campaign_id}                  Get a single campaign
    PUT    /{campaign_id}                  Update campaign name/description (auth required)
    DELETE /{campaign_id}                  Delete campaign and all related data (auth required)
    GET    /{campaign_id}/export           Download full campaign bundle as JSON (auth required)
    POST   /import                         Create a campaign from an exported bundle
    POST   /{campaign_id}/rotate-access-code  Generate a new access code (auth required)

Session routes:
    GET    /{campaign_id}/sessions         List sessions for a campaign
    POST   /{campaign_id}/sessions         Start a new session (auth required)
    PUT    /sessions/{session_id}/end      Mark a session as ended (auth required)
    GET    /sessions/{session_id}/notes    Get collaborative session notes
    PUT    /sessions/{session_id}/notes    Replace collaborative session notes (auth required)
    GET    /sessions/{session_id}/pins     Get pinned notes for a session
    PUT    /sessions/{session_id}/pins     Replace pinned notes; broadcasts pinned_update (auth required)
    GET    /sessions/{session_id}/dm-notes Get private DM notes (auth required)
    PUT    /sessions/{session_id}/dm-notes Replace private DM notes (auth required)
    POST   /sessions/{session_id}/recap    Generate AI session recap via Claude Haiku

Dungeon map routes:
    GET    /{campaign_id}/map              Return the campaign's dungeon map; auto-generates
                                           one the first time it is requested.
    POST   /{campaign_id}/map/generate     Force-regenerate the dungeon map (auth required).
    GET    /{campaign_id}/map/annotations  Get DM map annotation pins
    PUT    /{campaign_id}/map/annotations  Replace map annotations; broadcasts map_annotation_update
                                           (auth required)

World state / tools:
    GET    /{campaign_id}/world-time       Get world clock / weather state
    PUT    /{campaign_id}/world-time       Update world clock / weather; broadcasts time_update
                                           (auth required)
    GET    /{campaign_id}/npcs             List all NPCs for a campaign
    GET    /{campaign_id}/quests           List all quests for a campaign
    GET    /{campaign_id}/party            Get party shared gold + items
    PUT    /{campaign_id}/party            Update party state; broadcasts party_update (auth required)
    GET    /{campaign_id}/handouts         List player handouts
    POST   /{campaign_id}/handouts         Create a handout; broadcasts handout_push (auth required)
    DELETE /{campaign_id}/handouts/{id}    Delete a handout (auth required)
    GET    /{campaign_id}/timeline         Get campaign timeline events
    POST   /{campaign_id}/timeline         Add a timeline event (auth required)
    DELETE /{campaign_id}/timeline/{id}    Delete a timeline event (auth required)
    GET    /{campaign_id}/readalouds       List read-aloud library entries
    POST   /{campaign_id}/readalouds       Create a read-aloud entry (auth required)
    DELETE /{campaign_id}/readalouds/{id}  Delete a read-aloud entry (auth required)
    POST   /{campaign_id}/loot             Generate AI loot (CR + environment)
    POST   /{campaign_id}/generate-names   Generate AI NPC names (race + count)
    GET    /{campaign_id}/tables           List random tables
    POST   /{campaign_id}/tables           Create a random table (auth required)
    POST   /{campaign_id}/tables/{id}/roll Roll on a random table
    DELETE /{campaign_id}/tables/{id}      Delete a random table (auth required)

Admin:
    GET    /admin/backup                   Download full DB backup as JSON (requires X-Admin-Key)

Performance notes:
  session_count and message_count are computed via correlated scalar subqueries
  rather than eager-loading relationship collections, keeping list endpoints O(1)
  in memory regardless of how many sessions or messages a campaign has.

Authentication: write operations require the campaign's access code in the
``X-Access-Code`` request header (generated at campaign creation time and
returned in the campaign response).  All comparisons use ``hmac.compare_digest``
to prevent timing-oracle attacks.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.sql.elements import ColumnElement

from anthropic import AsyncAnthropic

from backend.auth import require_campaign_access, require_session_access
from backend.database import get_db
from backend.models.campaign import (
    Campaign,
    CampaignCreate,
    CampaignCreateResponse,
    CampaignResponse,
    Session as GameSession,
    SessionMessage,
    SessionResponse,
)
from backend.models.character import Character
from backend.services.map_generator import generate_dungeon
from backend.ws.session_hub import session_hub

router = APIRouter()

# Shared Anthropic client — reused across all endpoints in this module so we
# avoid opening a new HTTP connection on every request.
_anthropic_client = AsyncAnthropic()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _session_count_sq(campaign_id_col) -> "ColumnElement":
    """Scalar subquery: number of sessions for a campaign column expression."""
    return (
        select(func.count())
        .where(GameSession.campaign_id == campaign_id_col)
        .correlate_except(GameSession)
        .scalar_subquery()
    )


def _msg_count_sq(session_id_col) -> "ColumnElement":
    """Scalar subquery: number of messages for a session column expression."""
    return (
        select(func.count())
        .where(SessionMessage.session_id == session_id_col)
        .correlate_except(SessionMessage)
        .scalar_subquery()
    )


def _campaign_to_response(campaign: Campaign, session_count: int = 0) -> CampaignResponse:
    """Convert a Campaign ORM object to a CampaignResponse (no access_code)."""
    resp = CampaignResponse.model_validate(campaign)
    resp.session_count = session_count
    return resp


def _campaign_to_create_response(campaign: Campaign, session_count: int = 0) -> CampaignCreateResponse:
    """Convert a Campaign ORM object to a CampaignCreateResponse (includes access_code)."""
    resp = CampaignCreateResponse.model_validate(campaign)
    resp.session_count = session_count
    return resp


# ---------------------------------------------------------------------------
# Campaign endpoints
# ---------------------------------------------------------------------------


@router.get("/", response_model=list[CampaignResponse])
async def list_campaigns(response: Response, db: AsyncSession = Depends(get_db)):
    """Return all campaigns ordered by creation date descending."""
    response.headers["Cache-Control"] = "public, max-age=10"
    count_sq = _session_count_sq(Campaign.id).label("session_count")
    result = await db.execute(
        select(Campaign, count_sq).order_by(Campaign.created_at.desc())
    )
    return [_campaign_to_response(c, cnt) for c, cnt in result.all()]


@router.post("/", response_model=CampaignCreateResponse, status_code=status.HTTP_201_CREATED)
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
    return _campaign_to_create_response(campaign, session_count=0)


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(campaign_id: str, response: Response, db: AsyncSession = Depends(get_db)):
    """Return a single campaign by ID."""
    response.headers["Cache-Control"] = "public, max-age=10"
    count_sq = _session_count_sq(campaign_id).label("session_count")
    result = await db.execute(
        select(Campaign, count_sq).where(Campaign.id == campaign_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )
    campaign, sess_count = row
    return _campaign_to_response(campaign, sess_count)


class CampaignUpdate(BaseModel):
    """Partial-update body for a campaign (PATCH semantics).

    Only ``name`` and ``description`` may be changed after creation; the
    ruleset is immutable to avoid invalidating existing game-state data.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Update campaign name and/or description."""
    count_sq = _session_count_sq(campaign_id).label("session_count")
    result = await db.execute(
        select(Campaign, count_sq).where(Campaign.id == campaign_id)
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )
    campaign, sess_count = row

    if payload.name is not None:
        campaign.name = payload.name
    if payload.description is not None:
        campaign.description = payload.description

    await db.flush()
    return _campaign_to_response(campaign, sess_count)


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

    count_sq = _msg_count_sq(GameSession.id).label("message_count")
    result = await db.execute(
        select(GameSession, count_sq)
        .where(GameSession.campaign_id == campaign_id)
        .order_by(GameSession.started_at.desc())
    )

    def _to_session_resp(sess: GameSession, cnt: int) -> SessionResponse:
        r = SessionResponse.model_validate(sess)
        r.message_count = cnt
        return r

    return [_to_session_resp(s, c) for s, c in result.all()]


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
    # Re-query with msg_objects loaded so SessionResponse.parse_messages can use it
    sess_result = await db.execute(
        select(GameSession)
        .options(selectinload(GameSession.msg_objects))
        .where(GameSession.id == session.id)
    )
    session = sess_result.scalar_one()
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
async def list_npcs(campaign_id: str, response: Response, db: AsyncSession = Depends(get_db)):
    """Return the NPC registry for a campaign."""
    response.headers["Cache-Control"] = "public, max-age=30"
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
async def list_quests(campaign_id: str, response: Response, db: AsyncSession = Depends(get_db)):
    """Return the quest log for a campaign."""
    response.headers["Cache-Control"] = "public, max-age=30"
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

    notes: str = Field(max_length=50_000)


@router.put("/sessions/{session_id}/notes")
async def update_session_notes(
    session_id: str,
    payload: SessionNotesUpdate,
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(require_session_access),
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
        select(GameSession)
        .options(selectinload(GameSession.msg_objects))
        .where(GameSession.id == session_id)
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
    id: str = Field(max_length=64)
    text: str = Field(max_length=1000)


class PinsUpdate(BaseModel):
    pins: list[PinEntry] = []


@router.put("/sessions/{session_id}/pins")
async def update_session_pins(
    session_id: str,
    payload: PinsUpdate,
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(require_session_access),
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
        if 5 <= h < 8:
            existing["time_of_day"] = "dawn"
        elif 8 <= h < 12:
            existing["time_of_day"] = "morning"
        elif 12 <= h < 17:
            existing["time_of_day"] = "afternoon"
        elif 17 <= h < 20:
            existing["time_of_day"] = "evening"
        elif 20 <= h < 23:
            existing["time_of_day"] = "night"
        else:
            existing["time_of_day"] = "midnight"
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
async def get_timeline(campaign_id: str, response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=30"
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
async def generate_loot_endpoint(
    campaign_id: str,
    payload: LootRequest,
    _campaign: Campaign = Depends(require_campaign_access),
):
    """Generate treasure loot appropriate for the given CR and environment."""
    from backend.services.dm_brain import DungeonMaster
    dm_instance = DungeonMaster()
    items = await dm_instance.generate_loot(payload.cr, payload.environment, payload.count)
    return {"campaign_id": campaign_id, "items": items}


@router.post("/{campaign_id}/trap")
async def generate_trap(
    campaign_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404)
    from backend.services.dm_brain import DungeonMaster
    dm = DungeonMaster(campaign_id=campaign_id, ruleset=campaign.ruleset)
    result = await dm.generate_trap(
        cr=float(body.get("cr", 1)),
        location=body.get("location", "dungeon corridor")
    )
    return result


@router.post("/{campaign_id}/puzzle")
async def generate_puzzle(
    campaign_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404)
    from backend.services.dm_brain import DungeonMaster
    dm = DungeonMaster(campaign_id=campaign_id, ruleset=campaign.ruleset)
    result = await dm.generate_puzzle(
        difficulty=body.get("difficulty", "medium"),
        theme=body.get("theme", "arcane")
    )
    return result


@router.post("/{campaign_id}/shop")
async def generate_shop(
    campaign_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404)
    from backend.services.dm_brain import DungeonMaster
    dm = DungeonMaster(campaign_id=campaign_id, ruleset=campaign.ruleset)
    result = await dm.generate_shop(
        settlement_size=body.get("settlement_size", "town"),
        shop_type=body.get("shop_type", "general store")
    )
    return result


# ---------------------------------------------------------------------------
# DM private notes endpoints
# ---------------------------------------------------------------------------


@router.get("/sessions/{session_id}/dm-notes")
async def get_dm_notes(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_session_access),
):
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "dm_notes": session.dm_notes or ""}


class DMNotesUpdate(BaseModel):
    dm_notes: str = Field(max_length=50_000)


@router.put("/sessions/{session_id}/dm-notes")
async def update_dm_notes(
    session_id: str,
    payload: DMNotesUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_session_access),
):
    result = await db.execute(select(GameSession).where(GameSession.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    session.dm_notes = payload.dm_notes
    await db.flush()
    return {"session_id": session_id, "dm_notes": session.dm_notes}


# ---------------------------------------------------------------------------
# Read-aloud library endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/readalouds")
async def get_readalouds(campaign_id: str, response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=30"
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id!r} not found")
    return {"campaign_id": campaign_id, "readalouds": json.loads(campaign.readalouds or "[]")}


class ReadAloudCreate(BaseModel):
    title: str
    content: str


@router.post("/{campaign_id}/readalouds")
async def create_readaloud(
    campaign_id: str,
    payload: ReadAloudCreate,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    from datetime import timezone
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id!r} not found")
    readalouds = json.loads(campaign.readalouds or "[]")
    entry = {"id": str(uuid.uuid4()), "title": payload.title, "content": payload.content, "created_at": datetime.now(timezone.utc).isoformat()}
    readalouds.append(entry)
    campaign.readalouds = json.dumps(readalouds)
    await db.flush()
    return {"campaign_id": campaign_id, "readaloud": entry}


@router.delete("/{campaign_id}/readalouds/{readaloud_id}")
async def delete_readaloud(
    campaign_id: str, readaloud_id: str,
    db: AsyncSession = Depends(get_db),
    _campaign: Campaign = Depends(require_campaign_access),
):
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=404, detail=f"Campaign {campaign_id!r} not found")
    readalouds = [r for r in json.loads(campaign.readalouds or "[]") if r["id"] != readaloud_id]
    campaign.readalouds = json.dumps(readalouds)
    await db.flush()
    return {"campaign_id": campaign_id, "readalouds": readalouds}


# ---------------------------------------------------------------------------
# NPC name generator endpoint
# ---------------------------------------------------------------------------


class NameGenRequest(BaseModel):
    race: str = "human"
    count: int = 6


@router.post("/{campaign_id}/generate-names")
async def generate_npc_names(campaign_id: str, payload: NameGenRequest):
    """Generate NPC names for the given race using Claude Haiku."""
    prompt = (
        f"Generate exactly {payload.count} distinct fantasy NPC names for a {payload.race} "
        "in a D&D-style setting. Return ONLY a JSON array of name strings. "
        'Example: ["Aldric Vane", "Mira of the Stone", "Jorren Blackwell"]'
    )
    response = await _anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=[{
            "type": "text",
            "text": "You are a fantasy name generator. Respond with a JSON array of strings only.",
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": prompt}],
    )
    text = response.content[0].text.strip()
    try:
        names = json.loads(text)
        if isinstance(names, list):
            return {"campaign_id": campaign_id, "names": [str(n) for n in names[:payload.count]]}
    except (json.JSONDecodeError, ValueError):
        pass
    names = [ln.strip().lstrip("0123456789.-) \"'") for ln in text.split("\n") if ln.strip()]
    return {"campaign_id": campaign_id, "names": [n for n in names if n][:payload.count]}


# ---------------------------------------------------------------------------
# Random tables endpoints
# ---------------------------------------------------------------------------


def _safe_json(raw, default):
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return default
    return raw if raw is not None else default


@router.get("/{campaign_id}/tables")
async def get_tables(campaign_id: str, db: AsyncSession = Depends(get_db)):
    """Return all random tables for a campaign."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _safe_json(getattr(campaign, "random_tables", None), [])


@router.post("/{campaign_id}/tables")
async def create_table(
    campaign_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    _auth: Campaign = Depends(require_campaign_access),
):
    """Create a new random table for a campaign."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    tables = _safe_json(getattr(campaign, "random_tables", None), [])
    new_table = {
        "id": str(uuid.uuid4())[:8],
        "name": body.get("name", "Unnamed Table"),
        "dice": body.get("dice", "d6"),
        "entries": body.get("entries", []),
    }
    tables.append(new_table)
    campaign.random_tables = json.dumps(tables)
    await db.commit()
    return new_table


@router.post("/{campaign_id}/tables/{table_id}/roll")
async def roll_table(campaign_id: str, table_id: str, db: AsyncSession = Depends(get_db)):
    """Roll on a random table."""
    import random as rnd
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    tables = _safe_json(getattr(campaign, "random_tables", None), [])
    table = next((t for t in tables if t["id"] == table_id), None)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    entries = table.get("entries", [])
    if not entries:
        raise HTTPException(status_code=400, detail="Table has no entries")
    result = rnd.choice(entries)
    return {"result": result, "table": table["name"]}


@router.delete("/{campaign_id}/tables/{table_id}")
async def delete_table(
    campaign_id: str,
    table_id: str,
    db: AsyncSession = Depends(get_db),
    _auth: Campaign = Depends(require_campaign_access),
):
    """Delete a random table from a campaign."""
    campaign = await db.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    tables = _safe_json(getattr(campaign, "random_tables", None), [])
    tables = [t for t in tables if t["id"] != table_id]
    campaign.random_tables = json.dumps(tables)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Session recap endpoint
# ---------------------------------------------------------------------------


@router.post("/sessions/{session_id}/recap")
async def generate_recap(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_session_access),
):
    """Generate a dramatic 'Previously on...' recap for a session using Claude."""
    session = await db.get(GameSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    notes = getattr(session, "notes", "") or ""
    pinned = getattr(session, "pinned_notes", "") or ""
    context = (
        f"Session notes:\n{notes}\n\nPinned notes:\n{pinned}"
        if notes or pinned
        else "No notes recorded for this session."
    )

    response = await _anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=512,
        system=[{
            "type": "text",
            "text": (
                "You are a dramatic narrator for a tabletop RPG. Write vivid 'Previously on...' "
                "recaps in second person ('The party...') as if narrating to players at the start "
                "of the next session. Be evocative and engaging."
            ),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": context}],
    )
    recap_text = response.content[0].text if response.content else "No recap available."
    return {"recap": recap_text}


# ---------------------------------------------------------------------------
# Admin backup endpoint
# ---------------------------------------------------------------------------


@router.get("/admin/backup")
async def admin_backup(
    db: AsyncSession = Depends(get_db),
    x_admin_key: str = Header(default=""),
):
    """Return a full backup of all campaigns, sessions, and characters."""
    import os
    expected = os.getenv("ADMIN_KEY", "")
    if not expected or not hmac.compare_digest(expected, x_admin_key):
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Key header")
    results = await asyncio.gather(
        db.execute(select(Campaign)),
        db.execute(select(GameSession)),
        db.execute(select(Character)),
    )
    campaigns = results[0].scalars().all()
    sessions = results[1].scalars().all()
    characters = results[2].scalars().all()

    return {
        "campaigns": [CampaignResponse.model_validate(c).model_dump() for c in campaigns],
        "sessions": [SessionResponse.model_validate(s).model_dump() for s in sessions],
        "characters": [{"id": c.id, "name": c.name, "campaign_id": c.campaign_id} for c in characters],
    }

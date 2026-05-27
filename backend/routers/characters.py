"""
Character REST endpoints for the AI Dungeon Master application.

Routes:
    GET    /{campaign_id}/characters      List characters for a campaign
    POST   /{campaign_id}/characters      Create a character in a campaign
    GET    /characters/{character_id}     Get a single character
    PUT    /characters/{character_id}     Update a character (PATCH semantics)
    DELETE /characters/{character_id}    Delete a character
"""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import require_campaign_access, require_character_access
from backend.database import get_db
from backend.models.campaign import Campaign
from backend.models.character import (
    Character,
    CharacterCreate,
    CharacterResponse,
    CharacterUpdate,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _to_response(char: Character) -> CharacterResponse:
    """Convert a Character ORM object to a CharacterResponse Pydantic model."""
    return CharacterResponse.model_validate(char)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/{campaign_id}/characters", response_model=list[CharacterResponse])
async def list_characters(
    campaign_id: str, db: AsyncSession = Depends(get_db)
):
    """Return all characters for the given campaign."""
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    if campaign_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    result = await db.execute(
        select(Character)
        .where(Character.campaign_id == campaign_id)
        .order_by(Character.name)
    )
    characters = result.scalars().all()
    return [_to_response(c) for c in characters]


@router.post(
    "/{campaign_id}/characters",
    response_model=CharacterResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_character(
    campaign_id: str,
    payload: CharacterCreate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_campaign_access),
):
    """Create a new character in the given campaign."""
    campaign_result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id)
    )
    if campaign_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign {campaign_id!r} not found",
        )

    character = Character(
        id=str(uuid.uuid4()),
        campaign_id=campaign_id,
        player_name=payload.player_name,
        name=payload.name,
        race=payload.race,
        class_name=payload.class_name,
        level=payload.level,
        hp_current=payload.hp_current,
        hp_max=payload.hp_max,
        stats=json.dumps(payload.stats),
        inventory=json.dumps(payload.inventory),
        conditions=json.dumps(payload.conditions),
        notes=payload.notes,
    )
    db.add(character)
    await db.flush()
    return _to_response(character)


@router.get("/characters/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: str, db: AsyncSession = Depends(get_db)
):
    """Return a single character by ID."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    char = result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_id!r} not found",
        )
    return _to_response(char)


@router.put("/characters/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: str,
    payload: CharacterUpdate,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_character_access),
):
    """
    Update a character with PATCH semantics.

    Only fields that are explicitly set (non-None) in the payload are updated.
    """
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    char = result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_id!r} not found",
        )

    update_data = payload.model_dump(exclude_unset=True)

    _json_list_fields = (
        "stats", "inventory", "conditions", "spell_slots", "resources",
        "currency", "spellbook", "languages", "tool_proficiencies", "features",
    )

    def _safe_json(raw, default):
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                return default
        return raw if raw is not None else default

    for field_name, value in update_data.items():
        if field_name == "feature_use":
            # Special handling: decrement/increment uses_remaining on a feature
            feature_id = value.get("feature_id")
            delta = int(value.get("delta", -1))
            feats = _safe_json(char.features, [])
            for f in feats:
                if f.get("id") == feature_id:
                    new_uses = max(0, f.get("uses_remaining", 0) + delta)
                    f["uses_remaining"] = new_uses
            char.features = json.dumps(feats)
        elif field_name in _json_list_fields and not isinstance(value, str):
            # Serialize Python objects back to JSON strings for storage
            setattr(char, field_name, json.dumps(value) if value is not None else None)
        else:
            setattr(char, field_name, value)

    await db.flush()
    return _to_response(char)


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_character_access),
):
    """Delete a character by ID."""
    result = await db.execute(
        select(Character).where(Character.id == character_id)
    )
    char = result.scalar_one_or_none()
    if char is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Character {character_id!r} not found",
        )
    await db.delete(char)
    await db.flush()


@router.get("/characters/{character_id}/audit-log")
async def get_character_audit_log(character_id: str, db: AsyncSession = Depends(get_db)):
    """Return the audit log for a character."""
    result = await db.execute(select(Character).where(Character.id == character_id))
    char = result.scalar_one_or_none()
    if char is None:
        raise HTTPException(status_code=404, detail=f"Character {character_id!r} not found")
    try:
        audit = json.loads(char.audit_log or "[]")
    except (json.JSONDecodeError, TypeError):
        audit = []
    return {"character_id": character_id, "audit_log": audit}

"""REST endpoints for DM-controlled combat tracker actions.

All write endpoints require the campaign access code via X-Access-Code header
(verified through the session's parent campaign).

Routes:
    POST   /api/sessions/{session_id}/combat/next-turn     Advance initiative order
    POST   /api/sessions/{session_id}/combat/end           End the combat encounter
    POST   /api/sessions/{session_id}/combat/combatants    Add a combatant
    DELETE /api/sessions/{session_id}/combat/combatants/{name}  Remove a combatant
"""

from __future__ import annotations

import json
import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.auth import require_session_access
from backend.database import get_db
from backend.models.character import Character
from backend.services.game_state import Combatant, game_state_manager
from backend.ws.session_hub import session_hub

router = APIRouter(prefix="/api/sessions", tags=["combat"])


class CombatantAdd(BaseModel):
    """Request body for adding a combatant to an active combat encounter."""

    name: str
    initiative: int
    hp_current: int
    hp_max: int
    is_player: bool = False
    character_id: Optional[str] = None


@router.post("/{session_id}/combat/next-turn")
async def next_turn(
    session_id: str,
    _: None = Depends(require_session_access),
):
    """Advance the initiative order to the next combatant."""
    current = game_state_manager.get_combat(session_id)
    if not current.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat encounter for this session.",
        )
    state = game_state_manager.advance_turn(session_id)
    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()


@router.post("/{session_id}/combat/end")
async def end_combat(
    session_id: str,
    _: None = Depends(require_session_access),
):
    """End the current combat encounter and clear the tracker."""
    game_state_manager.end_combat(session_id)
    payload = {"type": "combat_update", "active": False, "round": 1, "turn_index": 0, "combatants": []}
    await session_hub.broadcast(session_id, payload)
    return {"active": False}


@router.post("/{session_id}/combat/combatants")
async def add_combatant(
    session_id: str,
    body: CombatantAdd,
    _: None = Depends(require_session_access),
):
    """Add a combatant to the active combat encounter."""
    state = game_state_manager.get_combat(session_id)
    if not state.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat encounter for this session.",
        )
    new_combatant = Combatant(
        name=body.name,
        initiative=body.initiative,
        hp_current=body.hp_current,
        hp_max=body.hp_max,
        is_player=body.is_player,
        character_id=body.character_id,
    )
    state.combatants.append(new_combatant)
    state.combatants.sort(key=lambda c: c.initiative, reverse=True)
    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()


@router.delete("/{session_id}/combat/combatants/{combatant_name}")
async def remove_combatant(
    session_id: str,
    combatant_name: str,
    _: None = Depends(require_session_access),
):
    """Remove a combatant from the active combat encounter by name."""
    state = game_state_manager.get_combat(session_id)
    if not state.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat encounter for this session.",
        )
    idx = next((i for i, c in enumerate(state.combatants) if c.name == combatant_name), None)
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Combatant {combatant_name!r} not found.",
        )
    state.combatants.pop(idx)
    if idx < state.turn_index:
        state.turn_index -= 1
    if state.combatants:
        state.turn_index = state.turn_index % len(state.combatants)
    else:
        state.turn_index = 0
    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()


class CombatantHPUpdate(BaseModel):
    delta: int  # positive = heal, negative = damage


@router.patch("/{session_id}/combat/combatants/{combatant_name}/hp")
async def update_combatant_hp(
    session_id: str,
    combatant_name: str,
    body: CombatantHPUpdate,
    _: None = Depends(require_session_access),
):
    """Apply an HP delta to a combatant (positive = heal, negative = damage)."""
    state = game_state_manager.get_combat(session_id)
    if not state.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat encounter for this session.",
        )
    combatant = next((c for c in state.combatants if c.name == combatant_name), None)
    if combatant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Combatant {combatant_name!r} not found.",
        )
    combatant.hp_current = max(0, min(combatant.hp_max, combatant.hp_current + body.delta))
    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()


@router.post("/{session_id}/combat/roll-initiative")
async def roll_initiative(
    session_id: str,
    _: None = Depends(require_session_access),
    db: AsyncSession = Depends(get_db),
):
    """Auto-roll 1d20 + DEX modifier initiative for all combatants and re-sort."""
    state = game_state_manager.get_combat(session_id)
    if not state.active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active combat encounter for this session.",
        )
    # Build DEX score map from character records
    char_dex: dict[str, int] = {}
    for c in state.combatants:
        if c.character_id:
            result = await db.execute(select(Character).where(Character.id == c.character_id))
            char = result.scalar_one_or_none()
            if char:
                try:
                    stats = json.loads(char.stats) if isinstance(char.stats, str) else char.stats
                    char_dex[c.character_id] = int(stats.get("DEX", 10))
                except (json.JSONDecodeError, TypeError, ValueError):
                    char_dex[c.character_id] = 10

    for combatant in state.combatants:
        dex = char_dex.get(combatant.character_id, 10) if combatant.character_id else 10
        dex_mod = (dex - 10) // 2
        combatant.initiative = random.randint(1, 20) + dex_mod

    state.combatants.sort(key=lambda c: c.initiative, reverse=True)
    state.turn_index = 0

    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()

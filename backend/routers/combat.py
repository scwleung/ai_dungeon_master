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

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth import require_session_access
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
    if state.combatants:
        state.turn_index = state.turn_index % len(state.combatants)
    else:
        state.turn_index = 0
    payload = {"type": "combat_update", **state.to_dict()}
    await session_hub.broadcast(session_id, payload)
    return state.to_dict()

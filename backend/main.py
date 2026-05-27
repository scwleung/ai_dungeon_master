"""
FastAPI application entry point for the AI Dungeon Master.

Provides:
  - REST API under /api/campaigns, /api/characters, /api/tts
  - WebSocket endpoint at /ws/{session_id}
  - SPA fallback: serves the compiled React frontend from frontend/dist/
    when that directory exists (i.e. in the Docker production image)

WebSocket message types (client → server):
  join_session         Register player in session room
  player_action        Typed narrative action text
  voice_transcript     STT-derived text, treated same as player_action
  dice_image           Base64 image for dice vision detection
  manual_roll          Player's manual dice result for a pending roll request

WebSocket message types (server → client):
  player_joined        Broadcast when someone joins
  player_left          Broadcast when someone disconnects
  dm_chunk             Streaming text fragment from Claude
  dm_response_complete Full DM response (end of stream)
  dice_result          DM or player dice roll result
  dice_request         Request for a specific player to roll
  state_update         Character stat update broadcast
  map_update           Fog-of-war update: newly explored room IDs
  combat_update        Full combat tracker state (active, round, turn, combatants)
  npc_update           Full NPC registry for the campaign
  quest_update         Full quest log for the campaign
  scene_image          URL of an AI-generated scene illustration
  system               Generic server notice (e.g. session lifecycle events)
  error                Error message

Context management:
  Rolling-window summarisation compresses old messages into session_summary
  when a session exceeds SUMMARY_THRESHOLD messages, keeping the most recent
  SUMMARY_KEEP_RECENT messages verbatim.  Cross-session continuity inherits
  the previous session's summary when a new session is started.
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
import time as _time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from sqlalchemy import text

from backend.database import AsyncSessionLocal, get_db, init_db
from backend.models.campaign import Campaign
from backend.models.campaign import Session as GameSession
from backend.models.character import Character
from backend.models.roll_result import roll_dice, RollResult
from backend.routers import campaigns, characters, tts as tts_router
from backend.routers import combat as combat_router
from backend.services.dm_brain import DungeonMaster
from backend.services.game_state import PendingRoll, game_state_manager
from backend.ws.session_hub import session_hub

load_dotenv()

_rl_store: dict[str, deque] = defaultdict(deque)
_RL_LIMIT = 60
_RL_WINDOW = 60.0

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        for col_sql in [
            "ALTER TABLE characters ADD COLUMN spell_slots TEXT",
            "ALTER TABLE characters ADD COLUMN resources TEXT",
            "ALTER TABLE sessions ADD COLUMN notes TEXT",
            "ALTER TABLE campaigns ADD COLUMN party_state TEXT",
            "ALTER TABLE sessions ADD COLUMN pinned_notes TEXT",
            "ALTER TABLE characters ADD COLUMN xp INTEGER",
            "ALTER TABLE characters ADD COLUMN death_saves TEXT",
            "ALTER TABLE characters ADD COLUMN concentration TEXT",
            "ALTER TABLE characters ADD COLUMN inspiration INTEGER DEFAULT 0",
            "ALTER TABLE campaigns ADD COLUMN map_annotations TEXT",
            "ALTER TABLE campaigns ADD COLUMN world_time TEXT",
            "ALTER TABLE campaigns ADD COLUMN handouts TEXT",
            "ALTER TABLE campaigns ADD COLUMN timeline TEXT",
            "ALTER TABLE characters ADD COLUMN currency TEXT",
            "ALTER TABLE characters ADD COLUMN spellbook TEXT",
            "ALTER TABLE characters ADD COLUMN audit_log TEXT",
            "ALTER TABLE sessions ADD COLUMN dm_notes TEXT",
            "ALTER TABLE campaigns ADD COLUMN readalouds TEXT",
        ]:
            try:
                await db.execute(text(col_sql))
                await db.commit()
            except Exception:
                await db.rollback()
    yield


app = FastAPI(
    title="AI Dungeon Master",
    version="1.0.0",
    lifespan=lifespan,
)


_RL_EXEMPT = {"127.0.0.1", "::1", "testclient", "localhost"}


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if not request.url.path.startswith("/api"):
        return await call_next(request)
    ip = (request.client.host if request.client else "unknown")
    if ip in _RL_EXEMPT:
        return await call_next(request)
    now = _time.monotonic()
    bucket = _rl_store[ip]
    while bucket and bucket[0] < now - _RL_WINDOW:
        bucket.popleft()
    if len(bucket) >= _RL_LIMIT:
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please wait before retrying."})
    bucket.append(now)
    return await call_next(request)


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

_raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173")
cors_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# REST routers
# ---------------------------------------------------------------------------

app.include_router(campaigns.router, prefix="/api/campaigns", tags=["campaigns"])
app.include_router(characters.router, prefix="/api", tags=["characters"])
app.include_router(tts_router.router, prefix="/api/tts", tags=["tts"])
app.include_router(combat_router.router)

# ---------------------------------------------------------------------------
# DM brain singleton (shared across all WS connections)
# ---------------------------------------------------------------------------

dm = DungeonMaster()

# Trigger summarisation when a session accumulates this many stored messages.
SUMMARY_THRESHOLD = 30
# Keep this many of the most recent messages verbatim after summarisation.
SUMMARY_KEEP_RECENT = 20


# ---------------------------------------------------------------------------
# WebSocket helpers
# ---------------------------------------------------------------------------


async def _save_message_to_db(
    session_id: str,
    role: str,
    text: str,
    player_name: Optional[str] = None,
) -> None:
    """Append a message to the session's messages JSON column."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            return

        try:
            messages: list[dict] = json.loads(session.messages)
        except (json.JSONDecodeError, TypeError):
            messages = []

        messages.append(
            {
                "id": str(uuid.uuid4()),
                "role": role,
                "player_name": player_name,
                "text": text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
        session.messages = json.dumps(messages)
        await db.commit()


async def _fetch_previous_session_summary(
    campaign_id: str, current_session_id: str
) -> str:
    """Return the most recent prior session's summary for cross-session continuity.

    When the previous session has no summary yet (a short session that never
    hit the rolling-window threshold), an on-demand summary is generated by
    Claude Haiku and cached on that session row for future use.

    Returns an empty string when there is no useful prior context.
    """
    async with AsyncSessionLocal() as db:
        prev_result = await db.execute(
            select(GameSession)
            .where(
                GameSession.campaign_id == campaign_id,
                GameSession.id != current_session_id,
            )
            .order_by(GameSession.started_at.desc())
            .limit(1)
        )
        prev = prev_result.scalar_one_or_none()
        if prev is None:
            return ""

        if prev.session_summary:
            return prev.session_summary

        # Previous session has messages but no rolling-window summary yet —
        # generate one on demand and cache it.
        try:
            prev_messages: list[dict] = json.loads(prev.messages or "[]")
        except (json.JSONDecodeError, TypeError):
            return ""

        if not prev_messages:
            return ""

        conversation_text = "\n".join(
            f"{m.get('role', 'user').upper()}: {m.get('text', '').strip()}"
            for m in prev_messages
            if m.get("text", "").strip()
        )
        if not conversation_text:
            return ""

        try:
            summary = await dm.summarize_history(conversation_text)
            prev.session_summary = summary
            await db.commit()
            return summary
        except Exception:
            return ""


async def _load_message_history(session_id: str) -> list[dict]:
    """
    Load prior messages from the DB and convert to Claude API format.

    Two sources of context are layered:

    1. **Cross-session continuity** — when called on a brand-new empty session,
       looks up the most recent prior session in the same campaign and inherits
       its ``session_summary`` so the DM has story continuity across play nights.
       The inherited summary is cached on the new session row after the first
       lookup.

    2. **Within-session summary** — if the session has a ``session_summary``
       generated by the rolling-window compressor, it is prepended as a
       synthetic user/assistant exchange.

    Returns a list of ``{"role": "user"|"assistant", "content": "..."}`` dicts.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            return []

        try:
            messages: list[dict] = json.loads(session.messages)
        except (json.JSONDecodeError, TypeError):
            messages = []

        summary: str = session.session_summary or ""

        # Fresh session with no history — inherit context from the previous session
        if not messages and not summary:
            inherited = await _fetch_previous_session_summary(
                session.campaign_id, session_id
            )
            if inherited:
                session.session_summary = inherited
                summary = inherited
                await db.commit()

    history: list[dict] = []

    # Prepend condensed context as a synthetic exchange Claude recognises
    if summary:
        history.append({
            "role": "user",
            "content": f"[Earlier session summary — use as background context]: {summary}",
        })
        history.append({
            "role": "assistant",
            "content": (
                "Understood. I have the earlier session context and will continue "
                "the story with full continuity."
            ),
        })

    # Convert recent messages to Claude API format
    for msg in messages:
        role = msg.get("role", "user")
        text = msg.get("text", "")
        # Map "system" → "user" for Claude API compatibility
        if role == "system":
            role = "user"
        if role in ("user", "assistant") and text:
            history.append({"role": role, "content": text})

    return history


async def _maybe_summarize_session(session_id: str) -> None:
    """Summarise older messages into ``session_summary`` when the window is full.

    When a session accumulates more than ``SUMMARY_THRESHOLD`` stored messages,
    the oldest ``len(messages) - SUMMARY_KEEP_RECENT`` entries are condensed
    by Claude (haiku) into a narrative summary which replaces the rolled-out
    messages.  Failure is silently swallowed so the game always continues.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None:
            return

        try:
            messages: list[dict] = json.loads(session.messages)
        except (json.JSONDecodeError, TypeError):
            return

        if len(messages) <= SUMMARY_THRESHOLD:
            return

        to_summarize = messages[:-SUMMARY_KEEP_RECENT]
        to_keep = messages[-SUMMARY_KEEP_RECENT:]

        conversation_text = "\n".join(
            f"{msg.get('role', 'user').upper()}: {msg.get('text', '').strip()}"
            for msg in to_summarize
            if msg.get("text", "").strip()
        )

        try:
            new_summary = await dm.summarize_history(
                conversation_text,
                existing_summary=session.session_summary or "",
            )
            session.session_summary = new_summary
            session.messages = json.dumps(to_keep)
            await db.commit()
        except Exception:
            pass  # non-fatal: next call will retry


async def _load_campaign_and_characters(
    campaign_id: str,
) -> tuple[Optional[Campaign], list[Character]]:
    """Load Campaign and its Characters from the DB."""
    async with AsyncSessionLocal() as db:
        campaign_result = await db.execute(
            select(Campaign)
            .options(selectinload(Campaign.characters))
            .where(Campaign.id == campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign is None:
            return None, []
        characters = list(campaign.characters)
        return campaign, characters


async def _update_character_in_db(character_id: str, tool_input: dict) -> str:
    """
    Apply an update_character tool call to the database.

    Returns a human-readable summary of changes made.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
        char = result.scalar_one_or_none()
        if char is None:
            return f"Character {character_id!r} not found."

        changes: list[str] = []

        # HP delta
        hp_delta = tool_input.get("hp_delta")
        if hp_delta is not None:
            old_hp = char.hp_current
            char.hp_current = max(0, min(char.hp_max, char.hp_current + hp_delta))
            direction = "healed" if hp_delta > 0 else "took"
            changes.append(
                f"{char.name} {direction} {abs(hp_delta)} HP "
                f"({old_hp} → {char.hp_current}/{char.hp_max})"
            )

        # Inventory changes
        try:
            inventory: list[str] = json.loads(char.inventory)
        except (json.JSONDecodeError, TypeError):
            inventory = []

        for item in tool_input.get("add_items", []):
            if item not in inventory:
                inventory.append(item)
                changes.append(f"Added '{item}' to {char.name}'s inventory")

        for item in tool_input.get("remove_items", []):
            if item in inventory:
                inventory.remove(item)
                changes.append(f"Removed '{item}' from {char.name}'s inventory")

        char.inventory = json.dumps(inventory)

        # Condition changes
        try:
            conditions: list[str] = json.loads(char.conditions)
        except (json.JSONDecodeError, TypeError):
            conditions = []

        for cond in tool_input.get("add_conditions", []):
            if cond not in conditions:
                conditions.append(cond)
                changes.append(f"{char.name} gained condition: {cond}")

        for cond in tool_input.get("remove_conditions", []):
            if cond in conditions:
                conditions.remove(cond)
                changes.append(f"{char.name} lost condition: {cond}")

        char.conditions = json.dumps(conditions)

        # Notes
        notes_append = tool_input.get("notes_append")
        if notes_append:
            char.notes = (char.notes or "") + "\n" + notes_append
            changes.append(f"Added note for {char.name}")

        # Spell slots
        if "spell_slots" in tool_input:
            char.spell_slots = json.dumps(tool_input["spell_slots"])
            changes.append(f"Updated spell slots for {char.name}")

        # Class resources
        if "resources" in tool_input:
            char.resources = json.dumps(tool_input["resources"])
            changes.append(f"Updated resources for {char.name}")

        # XP
        if "xp" in tool_input:
            char.xp = tool_input["xp"]
            changes.append(f"Updated XP for {char.name}")

        # Death saves
        if "death_saves" in tool_input:
            char.death_saves = json.dumps(tool_input["death_saves"])
            changes.append(f"Updated death saves for {char.name}")

        # Concentration
        if "concentration" in tool_input:
            char.concentration = tool_input["concentration"]  # str or None
            if tool_input["concentration"]:
                changes.append(f"{char.name} is concentrating on {tool_input['concentration']}")
            else:
                changes.append(f"{char.name} broke concentration")

        # Inspiration
        if "inspiration" in tool_input:
            char.inspiration = 1 if tool_input["inspiration"] else 0
            status = "gained" if tool_input["inspiration"] else "spent"
            changes.append(f"{char.name} {status} inspiration")

        if "currency" in tool_input:
            char.currency = json.dumps(tool_input["currency"])
            changes.append(f"Updated currency for {char.name}")

        if "spellbook" in tool_input:
            char.spellbook = json.dumps(tool_input["spellbook"])
            changes.append(f"Updated spellbook for {char.name}")

        # Append audit log entry
        if changes:
            try:
                audit = json.loads(char.audit_log or "[]")
            except (json.JSONDecodeError, TypeError):
                audit = []
            audit.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "change": "; ".join(changes),
            })
            char.audit_log = json.dumps(audit[-200:])  # cap at 200 entries

        await db.commit()

        return "; ".join(changes) if changes else f"No changes made to {char.name}."


async def _reveal_area_in_db(campaign_id: str, room_id: str) -> tuple[str, list[str]]:
    """Add room_id to explored_rooms in campaign.map_data and return (message, explored_list)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            return f"Campaign {campaign_id!r} not found.", []

        if not campaign.map_data:
            return "No map data available for this campaign.", []

        try:
            map_dict: dict = json.loads(campaign.map_data)
        except (json.JSONDecodeError, TypeError):
            return "Map data is corrupted.", []

        explored: list[str] = map_dict.get("explored_rooms", [])
        rooms: list[dict] = map_dict.get("rooms", [])

        room_name = next((r["name"] for r in rooms if r["id"] == room_id), room_id)

        if room_id not in explored:
            explored.append(room_id)
            map_dict["explored_rooms"] = explored
            campaign.map_data = json.dumps(map_dict)
            await db.commit()

        return f"Revealed '{room_name}' ({room_id}). Players' maps updated.", explored


async def _upsert_npc_in_db(campaign_id: str, npc_data: dict) -> tuple[str, list[dict]]:
    """Upsert an NPC in campaign.npcs JSON and return (message, npcs_list)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            return f"Campaign {campaign_id!r} not found.", []
        try:
            npcs: list[dict] = json.loads(campaign.npcs or "[]")
        except (json.JSONDecodeError, TypeError):
            npcs = []
        npc_id = npc_data.get("npc_id", "")
        if not npc_id:
            return "Missing npc_id.", npcs
        npc = {
            "id": npc_id,
            "name": npc_data.get("name", "Unknown"),
            "faction": npc_data.get("faction", ""),
            "attitude": npc_data.get("attitude", "unknown"),
            "location": npc_data.get("location", ""),
            "description": npc_data.get("description", ""),
            "notes": npc_data.get("notes", ""),
        }
        existing_idx = next((i for i, n in enumerate(npcs) if n.get("id") == npc_id), None)
        if existing_idx is not None:
            npcs[existing_idx] = npc
            action = "updated"
        else:
            npcs.append(npc)
            action = "added"
        campaign.npcs = json.dumps(npcs)
        await db.commit()
        return f"NPC '{npc['name']}' {action}.", npcs


async def _upsert_quest_in_db(campaign_id: str, quest_data: dict) -> tuple[str, list[dict]]:
    """Upsert a quest in campaign.quests JSON and return (message, quests_list)."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if campaign is None:
            return f"Campaign {campaign_id!r} not found.", []
        try:
            quests: list[dict] = json.loads(campaign.quests or "[]")
        except (json.JSONDecodeError, TypeError):
            quests = []
        quest_id = quest_data.get("quest_id", "")
        if not quest_id:
            return "Missing quest_id.", quests
        quest = {
            "id": quest_id,
            "name": quest_data.get("name", "Unknown"),
            "status": quest_data.get("status", "active"),
            "description": quest_data.get("description", ""),
        }
        existing_idx = next((i for i, q in enumerate(quests) if q.get("id") == quest_id), None)
        if existing_idx is not None:
            quests[existing_idx] = quest
            action = "updated"
        else:
            quests.append(quest)
            action = "added"
        campaign.quests = json.dumps(quests)
        await db.commit()
        return f"Quest '{quest['name']}' {action}.", quests


async def _update_party_state_in_db(campaign_id: str, gold_delta: int, add_items: list, remove_items: list):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_id))
        campaign = result.scalar_one_or_none()
        if not campaign:
            return None
        state = json.loads(campaign.party_state) if campaign.party_state else {"gold": 0, "items": []}
        state["gold"] = max(0, state["gold"] + gold_delta)
        items = list(state.get("items", []))
        for item in add_items:
            items.append(item)
        for item in remove_items:
            if item in items:
                items.remove(item)
        state["items"] = items
        campaign.party_state = json.dumps(state)
        db.add(campaign)
        await db.commit()
        return state


async def _update_world_state_in_db(campaign_id: str, updates: dict) -> str:
    """Apply world state key-value updates to the campaign in the DB."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Campaign).where(Campaign.id == campaign_id)
        )
        campaign = result.scalar_one_or_none()
        if campaign is None:
            return f"Campaign {campaign_id!r} not found."

        try:
            world_state: dict = json.loads(campaign.world_state)
        except (json.JSONDecodeError, TypeError):
            world_state = {}

        world_state.update(updates)
        campaign.world_state = json.dumps(world_state)
        await db.commit()

    keys_updated = ", ".join(updates.keys())
    return f"World state updated: {keys_updated}"


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(
    ws: WebSocket,
    session_id: str,
    player_id: str = "unknown",
    player_name: str = "Adventurer",
    access_code: str = "",
):
    """
    Main WebSocket endpoint for a game session.

    Query parameters:
        player_id:   Unique identifier for this player.
        player_name: Display name shown to other players.
        access_code: Campaign access code; omitting it or passing empty string
                     grants read-only spectator access.  An incorrect non-empty
                     code is rejected with close code 4403.
    """
    await session_hub.connect(ws, session_id, player_id)

    # Look up which campaign this session belongs to and verify access code
    campaign_id: Optional[str] = None
    is_spectator_conn = False
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        db_session = session_result.scalar_one_or_none()
        if db_session is not None:
            campaign_id = db_session.campaign_id
            campaign_result = await db.execute(
                select(Campaign).where(Campaign.id == campaign_id)
            )
            db_campaign = campaign_result.scalar_one_or_none()
            if db_campaign is not None:
                campaign_code = db_campaign.access_code or ""
                if campaign_code and not access_code:
                    is_spectator_conn = True
                elif campaign_code and access_code != campaign_code:
                    session_hub.disconnect(ws)
                    await ws.close(code=4403, reason="Invalid access code")
                    return
                elif not campaign_code and access_code:
                    # Campaign has no code; any provided code is accepted
                    pass

    if is_spectator_conn:
        session_hub.mark_spectator(ws)

    # Per-connection queue for awaiting player roll results
    # key: roll_request_id, value: asyncio.Queue that receives the result dict
    pending_roll_queues: dict[str, asyncio.Queue] = {}

    # ----------------------------------------------------------------
    # Tool-use callback (called by DM brain during streaming)
    # ----------------------------------------------------------------

    async def on_tool_use(tool_name: str, tool_input: dict) -> str:
        """Handle a tool call from Claude during DM response generation."""
        nonlocal campaign_id

        if tool_name == "roll_dice":
            dice = tool_input.get("dice", "1d20")
            reason = tool_input.get("reason", "")
            secret = tool_input.get("secret", False)
            try:
                result: RollResult = roll_dice(dice, reason=reason, secret=secret)
            except ValueError as exc:
                return f"Invalid dice notation: {exc}"

            roll_payload = {
                "type": "dice_result",
                "dice": result.dice,
                "values": result.values,
                "modifier": result.modifier,
                "total": result.total,
                "reason": result.reason,
                "secret": result.secret,
                "roller": "DM",
            }
            if not secret:
                await session_hub.broadcast(session_id, roll_payload)
            return (
                f"Rolled {result.dice}: individual values {result.values}, "
                f"modifier {result.modifier:+d}, total {result.total}. Reason: {reason}"
            )

        elif tool_name == "request_player_roll":
            target_player_id = tool_input.get("player_id", "")
            dice = tool_input.get("dice", "1d20")
            skill = tool_input.get("skill", "Check")
            dc = tool_input.get("dc")

            roll_request_id = str(uuid.uuid4())

            # Register the pending roll
            pending_roll = PendingRoll(
                roll_request_id=roll_request_id,
                player_id=target_player_id,
                dice=dice,
                skill=skill,
                dc=dc,
            )
            game_state_manager.add_pending_roll(session_id, pending_roll)

            # Create a queue to wait for the result
            result_queue: asyncio.Queue = asyncio.Queue()
            pending_roll_queues[roll_request_id] = result_queue

            # Send dice_request to the target player
            request_payload = {
                "type": "dice_request",
                "roll_request_id": roll_request_id,
                "player_id": target_player_id,
                "dice": dice,
                "skill": skill,
            }
            if dc is not None:
                request_payload["dc"] = dc

            advantage = tool_input.get("advantage")
            disadvantage = tool_input.get("disadvantage")
            if advantage:
                request_payload["advantage"] = True
            if disadvantage:
                request_payload["disadvantage"] = True

            await session_hub.send_to_player(session_id, target_player_id, request_payload)
            # Also broadcast so all players see the request
            await session_hub.broadcast(session_id, request_payload)

            # Wait for player to submit their roll (timeout: 5 minutes)
            try:
                roll_result = await asyncio.wait_for(result_queue.get(), timeout=300.0)
            except asyncio.TimeoutError:
                game_state_manager.resolve_pending_roll(session_id, roll_request_id)
                pending_roll_queues.pop(roll_request_id, None)
                return (
                    f"Player {target_player_id} did not submit their {skill} roll "
                    f"in time. Assume a middling result for narrative purposes."
                )

            pending_roll_queues.pop(roll_request_id, None)

            total = roll_result.get("total", 10)
            values = roll_result.get("values", [total])
            modifier = roll_result.get("modifier", 0)
            success_str = ""
            if dc is not None:
                success = total >= dc
                success_str = f" ({'SUCCESS' if success else 'FAILURE'} vs DC {dc})"

            return (
                f"Player {target_player_id} rolled {dice} for {skill}: "
                f"values {values}, modifier {modifier:+d}, total {total}{success_str}"
            )

        elif tool_name == "update_character":
            character_id = tool_input.get("character_id", "")
            if not character_id:
                return "Missing character_id for update_character tool."

            summary = await _update_character_in_db(character_id, tool_input)

            # Build a state_update payload to broadcast to all players
            async with AsyncSessionLocal() as db:
                char_result = await db.execute(
                    select(Character).where(Character.id == character_id)
                )
                updated_char = char_result.scalar_one_or_none()

            if updated_char:
                from backend.models.character import CharacterResponse
                char_data = CharacterResponse.model_validate(updated_char).model_dump()
                await session_hub.broadcast(
                    session_id,
                    {"type": "state_update", "character": char_data},
                )

            return summary

        elif tool_name == "update_world_state":
            if campaign_id is None:
                return "Cannot update world state: no campaign associated with this session."
            updates = tool_input.get("updates", {})
            if not updates:
                return "No updates provided for update_world_state."
            return await _update_world_state_in_db(campaign_id, updates)

        elif tool_name == "reveal_area":
            if campaign_id is None:
                return "Cannot reveal area: no campaign associated with this session."
            room_id = tool_input.get("room_id", "")
            if not room_id:
                return "Missing room_id for reveal_area tool."
            message, explored = await _reveal_area_in_db(campaign_id, room_id)
            if explored:
                await session_hub.broadcast(
                    session_id,
                    {"type": "map_update", "explored_rooms": explored},
                )
            return message

        elif tool_name == "start_combat":
            combatants_data = tool_input.get("combatants", [])
            state = game_state_manager.start_combat(session_id, combatants_data)
            await session_hub.broadcast(session_id, {"type": "combat_update", **state.to_dict()})
            current = state.current_combatant()
            return f"Combat started with {len(state.combatants)} combatants. First turn: {current.name if current else 'none'}."

        elif tool_name == "next_turn":
            state = game_state_manager.advance_turn(session_id)
            await session_hub.broadcast(session_id, {"type": "combat_update", **state.to_dict()})
            current = state.current_combatant()
            return f"Round {state.round}, turn: {current.name if current else 'none'}."

        elif tool_name == "end_combat":
            game_state_manager.end_combat(session_id)
            await session_hub.broadcast(session_id, {"type": "combat_update", "active": False, "round": 1, "turn_index": 0, "combatants": []})
            return "Combat ended."

        elif tool_name == "upsert_npc":
            if campaign_id is None:
                return "No campaign associated with this session."
            message, npcs = await _upsert_npc_in_db(campaign_id, tool_input)
            if npcs is not None:
                await session_hub.broadcast(session_id, {"type": "npc_update", "npcs": npcs})
            return message

        elif tool_name == "upsert_quest":
            if campaign_id is None:
                return "No campaign associated with this session."
            message, quests = await _upsert_quest_in_db(campaign_id, tool_input)
            if quests is not None:
                await session_hub.broadcast(session_id, {"type": "quest_update", "quests": quests})
            return message

        elif tool_name == "update_party_state":
            if campaign_id is None:
                return "No campaign associated with this session."
            state = await _update_party_state_in_db(
                campaign_id=campaign_id,
                gold_delta=tool_input.get("gold_delta", 0),
                add_items=tool_input.get("add_items", []),
                remove_items=tool_input.get("remove_items", []),
            )
            if state:
                await session_hub.broadcast(session_id, {"type": "party_update", "gold": state["gold"], "items": state["items"]})
            return f"Party state updated: gold={state['gold'] if state else 'unknown'}"

        elif tool_name == "generate_scene_image":
            description = tool_input.get("description", "")
            if not description:
                return "No description provided."
            try:
                from backend.services.image_service import generate_scene_image as gen_image
                url = await gen_image(description)
                await session_hub.broadcast(session_id, {"type": "scene_image", "url": url, "description": description})
                return "Scene image generated and displayed to all players."
            except Exception as exc:
                return f"Image generation unavailable: {exc}"

        return f"Unknown tool: {tool_name}"

    # ----------------------------------------------------------------
    # Main message loop
    # ----------------------------------------------------------------

    try:
        while True:
            try:
                raw = await ws.receive_text()
            except WebSocketDisconnect:
                break

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await session_hub.send_to_socket(
                    ws, {"type": "error", "message": "Invalid JSON"}
                )
                continue

            msg_type = data.get("type", "")

            # ------------------------------------------------------------
            # join_session
            # ------------------------------------------------------------
            if session_hub.is_spectator(ws) and msg_type in (
                "player_action", "voice_transcript", "dice_image", "manual_roll", "dice_result"
            ):
                continue  # spectators cannot take actions

            if msg_type == "join_session":
                incoming_player_name = data.get("player_name", player_name)
                game_state_manager.add_player(session_id, player_id, incoming_player_name)

                await session_hub.send_to_socket(
                    ws,
                    {
                        "type": "joined",
                        "session_id": session_id,
                        "player_id": player_id,
                        "player_name": incoming_player_name,
                        "is_spectator": is_spectator_conn,
                    },
                )
                await session_hub.broadcast(
                    session_id,
                    {
                        "type": "player_joined",
                        "player_id": player_id,
                        "player_name": incoming_player_name,
                    },
                    exclude_ws=ws,
                )

                # Check if this is a fresh session with a prior session summary (recap)
                async with AsyncSessionLocal() as recap_db:
                    sess_result = await recap_db.execute(
                        select(GameSession).where(GameSession.id == session_id)
                    )
                    sess_obj = sess_result.scalar_one_or_none()
                    if sess_obj:
                        try:
                            existing_msgs = json.loads(sess_obj.messages or "[]")
                        except Exception:
                            existing_msgs = []
                        # Fresh session (no messages yet) and has a prior session summary
                        if not existing_msgs and sess_obj.session_summary and not is_spectator_conn:
                            await session_hub.send_to_socket(ws, {
                                "type": "system",
                                "text": f"📜 Previously in your adventure: {sess_obj.session_summary}",
                            })

            # ------------------------------------------------------------
            # player_action or voice_transcript → run DM brain
            # ------------------------------------------------------------
            elif msg_type in ("player_action", "voice_transcript"):
                action_text = data.get("text", "").strip()
                if not action_text:
                    continue

                if campaign_id is None:
                    await session_hub.send_to_socket(
                        ws,
                        {
                            "type": "error",
                            "message": "Session is not linked to a campaign.",
                        },
                    )
                    continue

                # Broadcast the player's action to all players
                await session_hub.broadcast(
                    session_id,
                    {
                        "type": "player_action",
                        "player_id": player_id,
                        "player_name": player_name,
                        "text": action_text,
                    },
                )

                # Load campaign, characters, and history BEFORE saving the player
                # message so that _load_message_history sees an empty session on
                # the very first turn and can inherit context from the previous
                # session in this campaign. stream_response receives action_text
                # as new_message and appends it internally.
                campaign, char_list = await _load_campaign_and_characters(campaign_id)
                if campaign is None:
                    await session_hub.send_to_socket(
                        ws,
                        {"type": "error", "message": "Campaign not found."},
                    )
                    continue

                history = await _load_message_history(session_id)

                # Save player message to DB
                await _save_message_to_db(
                    session_id, "user", action_text, player_name=player_name
                )

                # Stream the DM response
                full_response_parts: list[str] = []

                async def _text_gen():
                    async for chunk in dm.stream_response(
                        campaign=campaign,
                        characters=char_list,
                        message_history=history,
                        new_message=action_text,
                        on_tool_use=on_tool_use,
                    ):
                        full_response_parts.append(chunk)
                        yield chunk

                try:
                    await session_hub.broadcast_dm_stream(session_id, _text_gen())
                except Exception as exc:
                    await session_hub.send_to_socket(
                        ws,
                        {"type": "error", "message": f"DM brain error: {exc}"},
                    )
                    continue

                # Save DM response to DB
                full_response = "".join(full_response_parts)
                if full_response:
                    await _save_message_to_db(
                        session_id, "assistant", full_response, player_name=None
                    )
                    # Roll up old messages into a summary when window is full
                    try:
                        await _maybe_summarize_session(session_id)
                    except Exception:
                        pass

            # ------------------------------------------------------------
            # dice_image → vision detection
            # ------------------------------------------------------------
            elif msg_type == "dice_image":
                frame_b64 = data.get("image", "")
                roll_request_id = data.get("roll_request_id")

                if not frame_b64:
                    await session_hub.send_to_socket(
                        ws, {"type": "error", "message": "No image data provided"}
                    )
                    continue

                try:
                    detected = await dm.detect_dice(frame_b64)
                except Exception as exc:
                    await session_hub.send_to_socket(
                        ws,
                        {"type": "error", "message": f"Dice detection failed: {exc}"},
                    )
                    continue

                # Calculate totals from detected dice
                total = sum(d["value"] for d in detected)
                values = [d["value"] for d in detected]

                result_payload = {
                    "type": "dice_result",
                    "detected": detected,
                    "values": values,
                    "modifier": 0,
                    "total": total,
                    "roller": player_name,
                    "player_id": player_id,
                    "roll_request_id": roll_request_id,
                }
                await session_hub.broadcast(session_id, result_payload)

                # If this was in response to a pending roll request, resolve it
                if roll_request_id and roll_request_id in pending_roll_queues:
                    game_state_manager.resolve_pending_roll(session_id, roll_request_id)
                    await pending_roll_queues[roll_request_id].put(
                        {
                            "total": total,
                            "values": values,
                            "modifier": 0,
                            "roll_request_id": roll_request_id,
                        }
                    )

            # ------------------------------------------------------------
            # manual_roll → player manually enters dice result
            # ------------------------------------------------------------
            elif msg_type == "manual_roll":
                roll_request_id = data.get("roll_request_id", "")
                total = int(data.get("total", 0))
                values = data.get("values", [total])
                modifier = int(data.get("modifier", 0))

                result_payload = {
                    "type": "dice_result",
                    "values": values,
                    "modifier": modifier,
                    "total": total,
                    "roller": player_name,
                    "player_id": player_id,
                    "roll_request_id": roll_request_id,
                    "manual": True,
                }
                await session_hub.broadcast(session_id, result_payload)

                # Resolve the pending roll if one is waiting
                if roll_request_id and roll_request_id in pending_roll_queues:
                    game_state_manager.resolve_pending_roll(session_id, roll_request_id)
                    await pending_roll_queues[roll_request_id].put(
                        {
                            "total": total,
                            "values": values,
                            "modifier": modifier,
                            "roll_request_id": roll_request_id,
                        }
                    )

            # ------------------------------------------------------------
            # dice_result → player submitting a physical dice roll result
            # ------------------------------------------------------------
            elif msg_type == "dice_result":
                roll_request_id = data.get("roll_request_id", "")
                total = int(data.get("total", 0))
                values = data.get("values", [total])
                modifier = int(data.get("modifier", 0))

                # Broadcast to all players in room
                broadcast_payload = {
                    "type": "dice_result",
                    "values": values,
                    "modifier": modifier,
                    "total": total,
                    "roller": player_name,
                    "player_id": player_id,
                    "roll_request_id": roll_request_id,
                }
                await session_hub.broadcast(session_id, broadcast_payload)

                # Resolve pending roll if applicable
                if roll_request_id and roll_request_id in pending_roll_queues:
                    game_state_manager.resolve_pending_roll(session_id, roll_request_id)
                    await pending_roll_queues[roll_request_id].put(
                        {
                            "total": total,
                            "values": values,
                            "modifier": modifier,
                            "roll_request_id": roll_request_id,
                        }
                    )

            elif msg_type == "voice_recording":
                # Relay recording state to all other clients in the room
                if not is_spectator_conn:
                    await session_hub.broadcast(
                        session_id,
                        {
                            "type": "voice_recording",
                            "player_id": data.get("player_id", player_id),
                            "active": bool(data.get("active", False)),
                        },
                        exclude_ws=ws,
                    )

            elif msg_type == "ambient_update":
                # DM broadcasts ambient sound selection to all clients
                if not is_spectator_conn:
                    await session_hub.broadcast(
                        session_id,
                        {
                            "type": "ambient_update",
                            "sound": data.get("sound", "none"),
                        },
                    )

            elif msg_type == "ooc_message":
                if not is_spectator_conn:
                    await session_hub.broadcast(
                        session_id,
                        {
                            "type": "ooc_broadcast",
                            "player_id": data.get("player_id", player_id),
                            "player_name": data.get("player_name", ""),
                            "text": data.get("text", ""),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        },
                    )

            elif msg_type == "ready_check":
                if not is_spectator_conn:
                    await session_hub.broadcast(
                        session_id,
                        {
                            "type": "ready_check",
                            "message": data.get("message", "Are you ready?"),
                            "from_player_id": player_id,
                        },
                    )

            elif msg_type == "ready_response":
                await session_hub.broadcast(
                    session_id,
                    {
                        "type": "ready_response",
                        "player_id": data.get("player_id", player_id),
                        "player_name": data.get("player_name", ""),
                        "ready": bool(data.get("ready", False)),
                    },
                )

            else:
                # Unknown message type — silently ignore to keep the connection alive
                pass

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        # Catch-all so the finally block always runs
        try:
            await session_hub.send_to_socket(
                ws, {"type": "error", "message": f"Unexpected error: {exc}"}
            )
        except Exception:
            pass
    finally:
        info = session_hub.disconnect(ws)
        if info:
            disconnected_session_id, disconnected_player_id = info
            game_state_manager.remove_player(
                disconnected_session_id, disconnected_player_id
            )
            # Cancel any pending roll queues so Claude doesn't hang
            for queue in pending_roll_queues.values():
                try:
                    queue.put_nowait({"total": 10, "values": [10], "modifier": 0, "timeout": True})
                except asyncio.QueueFull:
                    pass

            await session_hub.broadcast(
                disconnected_session_id,
                {
                    "type": "player_left",
                    "player_id": disconnected_player_id,
                    "player_name": player_name,
                },
            )


# ---------------------------------------------------------------------------
# SPA fallback — serve the built frontend in production (Docker)
# Must be mounted AFTER all API and WebSocket routes so /api/* and /ws/*
# are never intercepted by the static-file handler.
# ---------------------------------------------------------------------------

_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _dist.exists():
    # html=True makes StaticFiles return index.html for unknown paths,
    # which is required for client-side React Router navigation.
    app.mount("/", StaticFiles(directory=_dist, html=True), name="spa")

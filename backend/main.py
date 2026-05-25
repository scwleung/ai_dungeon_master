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
  dice_result          Player submitting a dice-camera result

WebSocket message types (server → client):
  joined               Confirms join_session
  player_joined        Broadcast when someone joins
  player_left          Broadcast when someone disconnects
  dm_chunk             Streaming text fragment from Claude
  dm_response_complete Full DM response (end of stream)
  dice_result          DM or player dice roll result
  dice_request         Request for a specific player to roll
  state_update         Character stat update broadcast
  error                Error message
"""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal, get_db, init_db
from backend.models.campaign import Campaign
from backend.models.campaign import Session as GameSession
from backend.models.character import Character
from backend.models.roll_result import roll_dice, RollResult
from backend.routers import campaigns, characters, tts as tts_router
from backend.services.dm_brain import DungeonMaster
from backend.services.game_state import PendingRoll, game_state_manager
from backend.ws.session_hub import session_hub

load_dotenv()

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="AI Dungeon Master",
    version="1.0.0",
    lifespan=lifespan,
)

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

# ---------------------------------------------------------------------------
# DM brain singleton (shared across all WS connections)
# ---------------------------------------------------------------------------

dm = DungeonMaster()


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


async def _load_message_history(session_id: str) -> list[dict]:
    """
    Load prior messages from the DB and convert to Claude API format.

    Returns a list of {"role": "user"|"assistant", "content": "..."} dicts.
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

    # Convert to Claude message history format
    history: list[dict] = []
    for msg in messages:
        role = msg.get("role", "user")
        text = msg.get("text", "")
        # Map "system" → "user" for Claude API compatibility
        if role == "system":
            role = "user"
        if role in ("user", "assistant") and text:
            history.append({"role": role, "content": text})

    return history


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

        await db.commit()

        return "; ".join(changes) if changes else f"No changes made to {char.name}."


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
):
    """
    Main WebSocket endpoint for a game session.

    Query parameters:
        player_id:   Unique identifier for this player.
        player_name: Display name shown to other players.
    """
    await session_hub.connect(ws, session_id, player_id)

    # Look up which campaign this session belongs to
    campaign_id: Optional[str] = None
    async with AsyncSessionLocal() as db:
        session_result = await db.execute(
            select(GameSession).where(GameSession.id == session_id)
        )
        db_session = session_result.scalar_one_or_none()
        if db_session is not None:
            campaign_id = db_session.campaign_id

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

                # Save player message to DB
                await _save_message_to_db(
                    session_id, "user", action_text, player_name=player_name
                )

                # Load campaign, characters, history
                campaign, char_list = await _load_campaign_and_characters(campaign_id)
                if campaign is None:
                    await session_hub.send_to_socket(
                        ws,
                        {"type": "error", "message": "Campaign not found."},
                    )
                    continue

                history = await _load_message_history(session_id)
                # The current user message is already in history, remove the last one
                # since stream_response will append it
                if history and history[-1]["role"] == "user":
                    history = history[:-1]

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

"""
In-memory game state management for active D&D sessions.

State lives only while the server is running — it is NOT persisted to the
database.  Persistent data (messages, character HP/inventory, world state)
is written to the DB through the router/WebSocket handler.

Classes:
  Combatant         — A single participant in a combat encounter.
                      Core fields: name, initiative, hp_current, hp_max,
                      is_player, character_id, conditions (list, str or dict).
                      Extended fields added for 5e mechanics:
                        legendary_actions_remaining (int) — current legendary
                          action uses available this round; toggled via the
                          ``combat_legendary_action`` WebSocket message.
                        legendary_actions_max (int) — maximum legendary actions
                          per round (0 for non-legendary creatures).
                        reaction_used (bool) — True when the combatant has spent
                          their reaction this round; set via ``combat_use_reaction``
                          and cleared by ``combat_reset_reactions`` WS messages.
  CombatState       — Full combat snapshot: active flag, round number, turn
                      index, and ordered combatant list.  advance() cycles
                      turns and increments the round counter automatically.
  PendingRoll       — A roll request sent to a player that is awaiting a result.
  GameStateManager  — Singleton that owns per-session PendingRoll and
                      CombatState dictionaries, plus connected-player tracking.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class Combatant:
    name: str
    initiative: int
    hp_current: int
    hp_max: int
    is_player: bool = False
    character_id: Optional[str] = None
    conditions: list = field(default_factory=list)
    legendary_actions_remaining: int = 0
    legendary_actions_max: int = 0
    reaction_used: bool = False

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "initiative": self.initiative,
            "hp_current": self.hp_current,
            "hp_max": self.hp_max,
            "is_player": self.is_player,
            "character_id": self.character_id,
            "conditions": list(self.conditions),
            "legendary_actions_remaining": self.legendary_actions_remaining,
            "legendary_actions_max": self.legendary_actions_max,
            "reaction_used": self.reaction_used,
        }


@dataclass
class CombatState:
    active: bool = False
    round: int = 1
    turn_index: int = 0
    combatants: list[Combatant] = field(default_factory=list)

    def current_combatant(self) -> Optional[Combatant]:
        if not self.active or not self.combatants:
            return None
        return self.combatants[self.turn_index % len(self.combatants)]

    def _tick_conditions(self) -> None:
        """Decrement duration on timed conditions; remove those that reach 0."""
        for combatant in self.combatants:
            new_conditions = []
            for cond in combatant.conditions:
                if isinstance(cond, dict):
                    duration = cond.get("duration")
                    if duration is None:
                        new_conditions.append(cond)  # permanent
                    elif duration > 1:
                        new_conditions.append({**cond, "duration": duration - 1})
                    # duration == 1 → expires, drop it
                else:
                    new_conditions.append(cond)  # plain string, no duration
            combatant.conditions = new_conditions

    def advance(self) -> None:
        if not self.combatants:
            return
        self.turn_index = (self.turn_index + 1) % len(self.combatants)
        if self.turn_index == 0:
            self.round += 1
        self._tick_conditions()

    def to_dict(self) -> dict:
        return {
            "active": self.active,
            "round": self.round,
            "turn_index": self.turn_index,
            "combatants": [c.to_dict() for c in self.combatants],
        }


@dataclass
class PendingRoll:
    """Represents a dice roll request that is waiting for a player's response."""

    roll_request_id: str
    player_id: str
    dice: str
    skill: str
    dc: Optional[int] = None


@dataclass
class ActiveSession:
    """In-memory state for one active game session."""

    session_id: str
    campaign_id: str
    # player_id -> player_name
    players: dict[str, str] = field(default_factory=dict)
    # roll_request_id -> PendingRoll
    pending_rolls: dict[str, PendingRoll] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Manager
# ---------------------------------------------------------------------------


class GameStateManager:
    """Thread-safe (asyncio single-threaded) in-memory manager for active sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, ActiveSession] = {}
        self._combat: dict[str, CombatState] = {}

    # ------------------------------------------------------------------
    # Session lifecycle
    # ------------------------------------------------------------------

    def create_session(self, session_id: str, campaign_id: str) -> ActiveSession:
        """
        Create and register a new active session.

        If a session with the same ID already exists, it is replaced.
        """
        session = ActiveSession(session_id=session_id, campaign_id=campaign_id)
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[ActiveSession]:
        """Return the active session for *session_id*, or None if not found."""
        return self._sessions.get(session_id)

    def end_session(self, session_id: str) -> None:
        """Remove a session from the in-memory store."""
        self._sessions.pop(session_id, None)

    # ------------------------------------------------------------------
    # Player management
    # ------------------------------------------------------------------

    def add_player(self, session_id: str, player_id: str, player_name: str) -> None:
        """
        Register a player in an active session.

        Creates the session if it does not yet exist (using an empty campaign_id).
        """
        session = self._sessions.get(session_id)
        if session is None:
            # Session may not have been created through create_session yet;
            # create a placeholder so players can join before the DM starts.
            session = ActiveSession(session_id=session_id, campaign_id="")
            self._sessions[session_id] = session
        session.players[player_id] = player_name

    def remove_player(self, session_id: str, player_id: str) -> None:
        """
        Remove a player from an active session.

        Does nothing if the session or player does not exist.
        """
        session = self._sessions.get(session_id)
        if session is not None:
            session.players.pop(player_id, None)

    # ------------------------------------------------------------------
    # Pending roll management
    # ------------------------------------------------------------------

    def add_pending_roll(self, session_id: str, roll: PendingRoll) -> None:
        """
        Register a pending dice-roll request for a player.

        Creates a placeholder session if needed.
        """
        session = self._sessions.get(session_id)
        if session is None:
            session = ActiveSession(session_id=session_id, campaign_id="")
            self._sessions[session_id] = session
        session.pending_rolls[roll.roll_request_id] = roll

    def resolve_pending_roll(
        self, session_id: str, roll_request_id: str
    ) -> Optional[PendingRoll]:
        """
        Remove and return a pending roll, or None if it does not exist.

        This is called when the player submits their dice result, marking the
        roll as resolved so Claude can continue generating the narrative.
        """
        session = self._sessions.get(session_id)
        if session is None:
            return None
        return session.pending_rolls.pop(roll_request_id, None)

    def get_pending_rolls_for_player(
        self, session_id: str, player_id: str
    ) -> list[PendingRoll]:
        """
        Return all pending rolls for a specific player in a session.

        Useful when a reconnecting player needs to re-submit outstanding rolls.
        """
        session = self._sessions.get(session_id)
        if session is None:
            return []
        return [
            roll
            for roll in session.pending_rolls.values()
            if roll.player_id == player_id
        ]

    # ------------------------------------------------------------------
    # Combat management
    # ------------------------------------------------------------------

    def get_combat(self, session_id: str) -> CombatState:
        return self._combat.get(session_id, CombatState())

    def start_combat(self, session_id: str, combatants_data: list[dict]) -> CombatState:
        combatants = sorted(
            [
                Combatant(
                    name=c.get("name", "Unknown"),
                    initiative=int(c.get("initiative", 0)),
                    hp_current=int(c.get("hp_current", c.get("hp", 10))),
                    hp_max=int(c.get("hp_max", c.get("hp", 10))),
                    is_player=bool(c.get("is_player", False)),
                    character_id=c.get("character_id"),
                    conditions=list(c.get("conditions", [])),
                    legendary_actions_max=c.get("legendary_actions_max", 0),
                    legendary_actions_remaining=c.get("legendary_actions_max", 0),
                )
                for c in combatants_data
            ],
            key=lambda x: x.initiative,
            reverse=True,
        )
        state = CombatState(active=True, round=1, turn_index=0, combatants=combatants)
        self._combat[session_id] = state
        return state

    def advance_turn(self, session_id: str) -> CombatState:
        state = self._combat.get(session_id)
        if state is None or not state.active:
            return CombatState()
        state.advance()
        return state

    def end_combat(self, session_id: str) -> None:
        self._combat.pop(session_id, None)

    # ------------------------------------------------------------------
    # Introspection
    # ------------------------------------------------------------------

    def list_sessions(self) -> list[str]:
        """Return a list of all active session IDs."""
        return list(self._sessions.keys())

    def session_count(self) -> int:
        """Return the number of currently active sessions."""
        return len(self._sessions)


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

game_state_manager = GameStateManager()

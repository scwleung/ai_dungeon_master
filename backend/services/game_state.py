"""
In-memory game state management for active D&D sessions.

State lives only while the server is running — it is NOT persisted to the
database.  Persistent data (messages, character HP/inventory, world state)
is written to the DB through the router/WebSocket handler.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


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

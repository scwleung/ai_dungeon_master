"""
WebSocket session hub for the AI Dungeon Master application.

Manages connections grouped by session room, tracks which player is behind
each socket, and provides broadcasting, per-socket targeting, and spectator
management helpers.

Key methods:
  broadcast(session_id, message, exclude_ws?)
      Send a JSON message to all WebSockets in a session room.  Used for
      game events (DM narration, combat updates, dice results, etc.).

  send_to_socket(ws, message)
      Send a JSON message to one specific WebSocket object.  Used for
      DM-only messages such as ``secret_roll_result`` that must never be
      broadcast to other players.

  send_to_player(session_id, player_id, message)
      Send a JSON message to the socket registered for a given player_id.
      Used to deliver ``dice_request`` directly to the targeted player.

  mark_spectator(ws)
      Flag a WebSocket as read-only.  Spectators receive all broadcast
      messages but are silently blocked from sending actions
      (``player_action``, ``voice_transcript``, ``dice_image``,
      ``manual_roll``, ``dice_result``).

  is_spectator(ws)
      Return True if the given WebSocket was marked as spectator-only.
"""

from __future__ import annotations

import time

from typing import AsyncGenerator, Optional

from fastapi import WebSocket


class SessionHub:
    """
    Manages WebSocket connections grouped by session room.

    A "room" is identified by a session_id string.  Multiple players can be
    in the same room.  Each WebSocket is associated with exactly one
    (session_id, player_id) pair.
    """

    def __init__(self) -> None:
        # session_id -> set of connected WebSockets
        self._rooms: dict[str, set[WebSocket]] = {}
        # ws -> (session_id, player_id)
        self._player_sockets: dict[WebSocket, tuple[str, str]] = {}
        # spectator-only connections
        self._spectators: set[WebSocket] = set()
        # session_id -> monotonic timestamp of last activity
        self._last_activity: dict[str, float] = {}

    # ------------------------------------------------------------------
    # Connection management
    # ------------------------------------------------------------------

    async def connect(
        self, ws: WebSocket, session_id: str, player_id: str
    ) -> None:
        """
        Accept a new WebSocket connection and register it in the session room.

        Args:
            ws: The FastAPI WebSocket object.
            session_id: The game session identifier.
            player_id: The player identifier for this connection.
        """
        await ws.accept()

        if session_id not in self._rooms:
            self._rooms[session_id] = set()
        self._rooms[session_id].add(ws)
        self._last_activity[session_id] = time.monotonic()
        self._player_sockets[ws] = (session_id, player_id)

    def mark_spectator(self, ws: WebSocket) -> None:
        """Mark a connected WebSocket as a spectator (read-only)."""
        self._spectators.add(ws)

    def is_spectator(self, ws: WebSocket) -> bool:
        """Return True if the given WebSocket is a spectator connection."""
        return ws in self._spectators

    def disconnect(self, ws: WebSocket) -> Optional[tuple[str, str]]:
        """
        Remove a WebSocket from its session room.

        Args:
            ws: The WebSocket that disconnected.

        Returns:
            (session_id, player_id) if the socket was registered, else None.
        """
        info = self._player_sockets.pop(ws, None)
        if info is None:
            return None

        session_id, player_id = info
        room = self._rooms.get(session_id)
        if room is not None:
            room.discard(ws)
            if not room:
                del self._rooms[session_id]

        self._spectators.discard(ws)

        # Clean up last-activity entry if the room is now empty
        if session_id not in self._rooms:
            self._last_activity.pop(session_id, None)

        return session_id, player_id

    def get_session_info(self, ws: WebSocket) -> Optional[tuple[str, str]]:
        """Return (session_id, player_id) for *ws*, or None if not registered."""
        return self._player_sockets.get(ws)

    def get_player_count(self, session_id: str) -> int:
        """Return the number of connected WebSockets in a session room."""
        room = self._rooms.get(session_id)
        return len(room) if room else 0

    # ------------------------------------------------------------------
    # Targeted messaging
    # ------------------------------------------------------------------

    async def send_to_player(
        self, session_id: str, player_id: str, message: dict
    ) -> None:
        """
        Send a JSON message to one specific player in a session.

        If the player is not connected, the message is silently dropped.
        """
        room = self._rooms.get(session_id)
        if not room:
            return

        target_ws: Optional[WebSocket] = None
        for ws, (sid, pid) in self._player_sockets.items():
            if sid == session_id and pid == player_id:
                target_ws = ws
                break

        if target_ws is not None:
            try:
                await target_ws.send_json(message)
            except Exception:
                # Connection may have closed between the lookup and the send
                pass

    async def send_to_socket(self, ws: WebSocket, message: dict) -> None:
        """Send a JSON message to a specific WebSocket object."""
        try:
            await ws.send_json(message)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Broadcasting
    # ------------------------------------------------------------------

    async def broadcast(
        self,
        session_id: str,
        message: dict,
        exclude_ws: Optional[WebSocket] = None,
    ) -> None:
        """
        Send a JSON message to all WebSockets in a session room.

        Args:
            session_id: The target session room.
            message: The JSON-serialisable payload.
            exclude_ws: If provided, this socket will not receive the message.
        """
        self._last_activity[session_id] = time.monotonic()
        room = self._rooms.get(session_id)
        if not room:
            return

        dead_sockets: list[WebSocket] = []
        for ws in list(room):
            if ws is exclude_ws:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.append(ws)

        # Clean up dead sockets
        for ws in dead_sockets:
            self.disconnect(ws)

    async def broadcast_dm_stream(
        self,
        session_id: str,
        text_chunks: AsyncGenerator[str, None],
    ) -> None:
        """
        Stream DM text chunks to all players in a session room.

        Sends individual ``dm_chunk`` messages as text arrives, followed by a
        single ``dm_response_complete`` message when the stream finishes.

        Args:
            session_id: The target session room.
            text_chunks: An async generator yielding text strings.
        """
        full_text_parts: list[str] = []

        try:
            async for chunk in text_chunks:
                if chunk:
                    full_text_parts.append(chunk)
                    await self.broadcast(
                        session_id,
                        {"type": "dm_chunk", "text": chunk},
                    )
        except Exception as exc:
            await self.broadcast(
                session_id,
                {"type": "error", "message": f"Stream error: {exc}"},
            )
            return

        full_text = "".join(full_text_parts)
        await self.broadcast(
            session_id,
            {"type": "dm_response_complete", "text": full_text},
        )

    async def close_all(self, message: str = "Server is restarting. Please reconnect in a moment.") -> None:
        """Send a notice to every connected socket and close them cleanly."""
        all_sockets = list(self._rooms.values())
        for room_sockets in all_sockets:
            for ws in list(room_sockets):
                try:
                    await ws.send_json({"type": "system", "text": message})
                    await ws.close(code=1001)
                except Exception:
                    pass
        self._rooms.clear()
        self._spectators.clear()
        self._player_sockets.clear()
        self._last_activity.clear()

    def evict_stale(self, max_age: float = 3600.0) -> list[str]:
        """Close and remove rooms with no activity for *max_age* seconds.

        Returns the list of evicted session IDs. Call periodically from a
        background task to prevent unbounded memory growth after clients
        disconnect without going through the normal teardown path.
        """
        now = time.monotonic()
        evicted: list[str] = []
        for session_id, last_seen in list(self._last_activity.items()):
            if now - last_seen > max_age:
                room = self._rooms.pop(session_id, set())
                for ws in room:
                    self._player_sockets.pop(ws, None)
                    self._spectators.discard(ws)
                self._last_activity.pop(session_id, None)
                evicted.append(session_id)
        return evicted


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

session_hub = SessionHub()

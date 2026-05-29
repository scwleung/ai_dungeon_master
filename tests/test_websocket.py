"""Integration tests for the WebSocket endpoint in backend/main.py."""

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch

from starlette.testclient import TestClient

from backend.main import app, dm


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_db_cm(campaign_id: str | None = None):
    """
    Return a mock usable as `AsyncSessionLocal()` context manager.

    Always gives back a mock async DB session whose `execute()` returns a
    result with `scalar_one_or_none()` producing either a fake GameSession
    (when *campaign_id* is set) or None.
    """
    fake_session = MagicMock()
    fake_session.campaign_id = campaign_id
    fake_session.messages = "[]"
    # access_code must be "" so the WS auth check passes (default param is "")
    fake_session.access_code = ""

    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = fake_session if campaign_id else None

    async_db = AsyncMock()
    async_db.execute = AsyncMock(return_value=exec_result)
    async_db.commit = AsyncMock()

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _base_patches(campaign_id: str | None = None) -> list:
    return [
        patch("backend.main.AsyncSessionLocal", return_value=_make_db_cm(campaign_id)),
        patch("backend.main.init_db", new_callable=AsyncMock),
    ]


def _full_action_patches(campaign_id: str = "camp-1") -> list:
    """All patches needed to exercise a player_action → DM response round-trip."""
    mock_campaign = MagicMock()
    mock_campaign.id = campaign_id
    mock_campaign.name = "Test Campaign"
    mock_campaign.ruleset = "dnd5e"
    mock_campaign.world_state = "{}"

    return [
        *_base_patches(campaign_id=campaign_id),
        patch(
            "backend.main._load_campaign_and_characters",
            new_callable=AsyncMock,
            return_value=(mock_campaign, []),
        ),
        patch(
            "backend.main._load_message_history",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch("backend.main._save_message_to_db", new_callable=AsyncMock),
    ]


# ---------------------------------------------------------------------------
# join_session
# ---------------------------------------------------------------------------


class TestJoinSession:
    def test_returns_joined_confirmation(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-1?player_id=p1&player_name=Alice"
                ) as ws:
                    ws.send_json({"type": "join_session", "player_name": "Alice"})
                    msg = ws.receive_json()

        assert msg["type"] == "joined"
        assert msg["session_id"] == "sess-1"
        assert msg["player_id"] == "p1"
        assert msg["player_name"] == "Alice"

    def test_uses_player_name_from_message_body(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-1b?player_id=p1&player_name=Default"
                ) as ws:
                    ws.send_json({"type": "join_session", "player_name": "Actual Name"})
                    msg = ws.receive_json()

        assert msg["player_name"] == "Actual Name"

    def test_second_player_triggers_player_joined_broadcast(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-2?player_id=p1&player_name=Alice"
                ) as ws1:
                    ws1.send_json({"type": "join_session", "player_name": "Alice"})
                    ws1.receive_json()  # consume ws1's "joined"

                    with client.websocket_connect(
                        "/ws/sess-2?player_id=p2&player_name=Bob"
                    ) as ws2:
                        ws2.send_json({"type": "join_session", "player_name": "Bob"})
                        ws2.receive_json()  # consume ws2's "joined"

                        # ws1 should now have a "player_joined" message queued
                        broadcast = ws1.receive_json()

        assert broadcast["type"] == "player_joined"
        assert broadcast["player_id"] == "p2"
        assert broadcast["player_name"] == "Bob"


# ---------------------------------------------------------------------------
# Invalid JSON
# ---------------------------------------------------------------------------


class TestInvalidJSON:
    def test_returns_error_on_malformed_json(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/sess-3?player_id=p1") as ws:
                    ws.send_text("{not valid json}")
                    msg = ws.receive_json()

        assert msg["type"] == "error"
        assert "Invalid JSON" in msg["message"]


# ---------------------------------------------------------------------------
# player_action
# ---------------------------------------------------------------------------


class TestPlayerAction:
    def test_player_action_with_no_campaign_returns_error(self):
        # campaign_id stays None because session lookup returns None
        with ExitStack() as s:
            for p in _base_patches(campaign_id=None):
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/sess-4?player_id=p1") as ws:
                    ws.send_json({"type": "join_session", "player_name": "Tester"})
                    ws.receive_json()  # "joined"

                    ws.send_json({"type": "player_action", "text": "I look around."})
                    msg = ws.receive_json()

        assert msg["type"] == "error"
        assert "campaign" in msg["message"].lower()

    def test_player_action_streams_dm_chunks(self):
        async def fake_stream(*args, **kwargs):
            yield "The dragon roars!"

        with ExitStack() as s:
            for p in _full_action_patches():
                s.enter_context(p)
            s.enter_context(patch.object(dm, "stream_response", new=fake_stream))
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-5?player_id=p1&player_name=Alice"
                ) as ws:
                    ws.send_json({"type": "join_session", "player_name": "Alice"})
                    ws.receive_json()  # "joined"

                    ws.send_json({"type": "player_action", "text": "I attack the goblin!"})

                    received = []
                    while True:
                        msg = ws.receive_json()
                        received.append(msg)
                        if msg["type"] == "dm_response_complete":
                            break

        types = [m["type"] for m in received]
        assert "player_action" in types  # broadcast echo
        assert "dm_chunk" in types
        assert "dm_response_complete" in types

    def test_player_action_dm_chunk_contains_streamed_text(self):
        async def fake_stream(*args, **kwargs):
            yield "Beware the dungeon!"

        with ExitStack() as s:
            for p in _full_action_patches():
                s.enter_context(p)
            s.enter_context(patch.object(dm, "stream_response", new=fake_stream))
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-6?player_id=p1&player_name=Bob"
                ) as ws:
                    ws.send_json({"type": "join_session", "player_name": "Bob"})
                    ws.receive_json()

                    ws.send_json({"type": "player_action", "text": "What do I see?"})

                    chunks = []
                    complete_text = None
                    while True:
                        msg = ws.receive_json()
                        if msg["type"] == "dm_chunk":
                            chunks.append(msg["text"])
                        elif msg["type"] == "dm_response_complete":
                            complete_text = msg["text"]
                            break

        assert "Beware the dungeon!" in chunks
        assert complete_text == "Beware the dungeon!"

    def test_empty_player_action_is_ignored(self):
        with ExitStack() as s:
            for p in _full_action_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/sess-7?player_id=p1") as ws:
                    ws.send_json({"type": "join_session", "player_name": "Tester"})
                    ws.receive_json()

                    ws.send_json({"type": "player_action", "text": "   "})
                    # No response expected for empty text — send a known message to unblock
                    ws.send_json({"type": "player_action", "text": "   "})

        # Test passes if no crash or hang occurs


# ---------------------------------------------------------------------------
# manual_roll
# ---------------------------------------------------------------------------


class TestManualRoll:
    def test_manual_roll_broadcasts_dice_result(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-8?player_id=p1&player_name=Rollmaster"
                ) as ws:
                    ws.send_json({"type": "join_session", "player_name": "Rollmaster"})
                    ws.receive_json()  # "joined"

                    ws.send_json(
                        {
                            "type": "manual_roll",
                            "roll_request_id": "req-abc",
                            "total": 18,
                            "values": [13, 5],
                            "modifier": 0,
                        }
                    )
                    msg = ws.receive_json()

        assert msg["type"] == "dice_result"
        assert msg["total"] == 18
        assert msg["values"] == [13, 5]
        assert msg["manual"] is True
        assert msg["player_id"] == "p1"

    def test_manual_roll_with_unknown_request_id_does_not_crash(self):
        """An unknown roll_request_id is simply ignored without error."""
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect("/ws/sess-9?player_id=p1") as ws:
                    ws.send_json({"type": "join_session", "player_name": "Tester"})
                    ws.receive_json()

                    ws.send_json(
                        {
                            "type": "manual_roll",
                            "roll_request_id": "nonexistent-999",
                            "total": 5,
                            "values": [5],
                            "modifier": 0,
                        }
                    )
                    msg = ws.receive_json()

        # Still broadcasts the dice_result even without a matching pending queue
        assert msg["type"] == "dice_result"
        assert msg["total"] == 5


# ---------------------------------------------------------------------------
# Disconnect cleanup
# ---------------------------------------------------------------------------


class TestDisconnect:
    def test_disconnect_broadcasts_player_left_to_remaining_players(self):
        with ExitStack() as s:
            for p in _base_patches():
                s.enter_context(p)
            with TestClient(app) as client:
                with client.websocket_connect(
                    "/ws/sess-10?player_id=p1&player_name=Alice"
                ) as ws1:
                    ws1.send_json({"type": "join_session", "player_name": "Alice"})
                    ws1.receive_json()  # ws1 "joined"

                    with client.websocket_connect(
                        "/ws/sess-10?player_id=p2&player_name=Bob"
                    ) as ws2:
                        ws2.send_json({"type": "join_session", "player_name": "Bob"})
                        ws2.receive_json()  # ws2 "joined"
                        ws1.receive_json()  # ws1 gets "player_joined" for Bob

                    # ws2 has now disconnected — ws1 should receive "player_left"
                    msg = ws1.receive_json()

        assert msg["type"] == "player_left"
        assert msg["player_id"] == "p2"

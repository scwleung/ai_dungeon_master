"""Tests for SessionHub from backend.ws.session_hub."""
from unittest.mock import AsyncMock

from backend.ws.session_hub import SessionHub


def make_ws():
    """Return a mock WebSocket with accept, send_json, and close."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    ws.send_json = AsyncMock()
    ws.close = AsyncMock()
    return ws


async def test_connect_calls_accept():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    ws.accept.assert_called_once()


async def test_connect_increments_player_count():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    assert hub.get_player_count("s1") == 1


async def test_disconnect_returns_session_and_player_id():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    info = hub.disconnect(ws)
    assert info == ("s1", "p1")


async def test_disconnect_decrements_player_count():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    hub.disconnect(ws)
    assert hub.get_player_count("s1") == 0


async def test_disconnect_unknown_ws_returns_none():
    hub = SessionHub()
    ws = make_ws()
    result = hub.disconnect(ws)
    assert result is None


async def test_disconnect_unknown_ws_no_error():
    hub = SessionHub()
    ws = make_ws()
    # Should not raise any exception
    hub.disconnect(ws)


async def test_get_session_info_after_connect():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    info = hub.get_session_info(ws)
    assert info == ("s1", "p1")


async def test_get_session_info_after_disconnect_returns_none():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    hub.disconnect(ws)
    info = hub.get_session_info(ws)
    assert info is None


async def test_two_players_in_same_session():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")
    assert hub.get_player_count("s1") == 2


async def test_broadcast_sends_to_all_players():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")

    msg = {"type": "test", "data": "hello"}
    await hub.broadcast("s1", msg)

    ws1.send_json.assert_called_once_with(msg)
    ws2.send_json.assert_called_once_with(msg)


async def test_broadcast_with_exclude_ws_skips_excluded():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")

    msg = {"type": "test"}
    await hub.broadcast("s1", msg, exclude_ws=ws1)

    ws1.send_json.assert_not_called()
    ws2.send_json.assert_called_once_with(msg)


async def test_broadcast_to_empty_session_no_error():
    hub = SessionHub()
    # Should not raise
    await hub.broadcast("nonexistent_session", {"type": "test"})


async def test_broadcast_to_nonexistent_session_no_error():
    hub = SessionHub()
    # Should not raise
    await hub.broadcast("ghost_session", {"type": "hello"})


async def test_send_to_player_only_targets_specific_player():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")

    msg = {"type": "private"}
    await hub.send_to_player("s1", "p1", msg)

    ws1.send_json.assert_called_once_with(msg)
    ws2.send_json.assert_not_called()


async def test_send_to_player_not_in_session_no_error():
    hub = SessionHub()
    ws1 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    # p99 is not connected
    await hub.send_to_player("s1", "p99", {"type": "test"})
    # Should not raise and ws1 should not receive the message
    ws1.send_json.assert_not_called()


async def test_broadcast_dm_stream_sends_chunks_and_complete():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")

    async def gen():
        yield "Hello "
        yield "world"

    await hub.broadcast_dm_stream("s1", gen())

    calls = ws.send_json.call_args_list
    assert len(calls) == 3  # 2 chunks + 1 complete

    assert calls[0][0][0] == {"type": "dm_chunk", "text": "Hello "}
    assert calls[1][0][0] == {"type": "dm_chunk", "text": "world"}
    assert calls[2][0][0] == {"type": "dm_response_complete", "text": "Hello world"}


async def test_broadcast_dm_stream_empty_generator():
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")

    async def empty_gen():
        return
        yield  # make it a generator

    await hub.broadcast_dm_stream("s1", empty_gen())

    calls = ws.send_json.call_args_list
    assert len(calls) == 1
    assert calls[0][0][0] == {"type": "dm_response_complete", "text": ""}


async def test_room_cleanup_after_all_players_disconnect():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")

    hub.disconnect(ws1)
    hub.disconnect(ws2)

    # Room should be fully removed from _rooms
    assert "s1" not in hub._rooms


async def test_dead_socket_during_broadcast_cleaned_up():
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    await hub.connect(ws1, "s1", "p1")
    await hub.connect(ws2, "s1", "p2")

    # Make ws1.send_json raise to simulate a dead socket
    ws1.send_json = AsyncMock(side_effect=Exception("Connection reset"))

    msg = {"type": "test"}
    # Should not raise; dead socket is cleaned up
    await hub.broadcast("s1", msg)

    # ws2 should still receive the message
    ws2.send_json.assert_called_once_with(msg)
    # ws1 should no longer be in the session
    assert hub.get_player_count("s1") == 1


# ---------------------------------------------------------------------------
# register() vs connect() unit tests
# ---------------------------------------------------------------------------


async def test_register_does_not_call_accept():
    """register() must add ws to _rooms WITHOUT calling ws.accept()."""
    hub = SessionHub()
    ws = make_ws()
    hub.register(ws, "s1", "p1")
    ws.accept.assert_not_called()


async def test_register_adds_ws_to_rooms():
    """register() must add the socket to _rooms even without accept()."""
    hub = SessionHub()
    ws = make_ws()
    hub.register(ws, "s1", "p1")
    assert hub.get_player_count("s1") == 1


async def test_register_records_session_info():
    """register() must record (session_id, player_id) in _player_sockets."""
    hub = SessionHub()
    ws = make_ws()
    hub.register(ws, "s1", "p1")
    assert hub.get_session_info(ws) == ("s1", "p1")


async def test_connect_calls_accept_then_registers():
    """connect() must call ws.accept() AND add ws to _rooms."""
    hub = SessionHub()
    ws = make_ws()
    await hub.connect(ws, "s1", "p1")
    ws.accept.assert_called_once()
    assert hub.get_player_count("s1") == 1


async def test_unregistered_ws_not_in_any_room():
    """A socket that was never registered must not appear in any room."""
    hub = SessionHub()
    ws = make_ws()
    # Never called register() or connect()
    assert hub.get_session_info(ws) is None
    assert hub.get_player_count("s1") == 0


async def test_register_multiple_sockets_same_session():
    """Two register() calls for different sockets in the same session are both tracked."""
    hub = SessionHub()
    ws1 = make_ws()
    ws2 = make_ws()
    hub.register(ws1, "s1", "p1")
    hub.register(ws2, "s1", "p2")
    assert hub.get_player_count("s1") == 2
    ws1.accept.assert_not_called()
    ws2.accept.assert_not_called()

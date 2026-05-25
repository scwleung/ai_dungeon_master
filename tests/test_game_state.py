"""Tests for GameStateManager from backend.services.game_state."""
import pytest

from backend.services.game_state import GameStateManager, ActiveSession, PendingRoll


def make_manager():
    """Return a fresh GameStateManager for each test."""
    return GameStateManager()


def test_create_session_returns_active_session():
    mgr = make_manager()
    session = mgr.create_session("s1", "c1")
    assert isinstance(session, ActiveSession)
    assert session.session_id == "s1"
    assert session.campaign_id == "c1"


def test_create_session_increments_session_count():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    assert mgr.session_count() == 1


def test_get_session_nonexistent_returns_none():
    mgr = make_manager()
    assert mgr.get_session("nonexistent") is None


def test_create_session_twice_replaces_old_session():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    # Add a player so we can verify replacement
    mgr.add_player("s1", "p1", "Alice")
    mgr.create_session("s1", "c2")
    session = mgr.get_session("s1")
    assert session.campaign_id == "c2"
    assert "p1" not in session.players
    # Count should still be 1 (replaced, not added)
    assert mgr.session_count() == 1


def test_add_player_appears_in_session():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    mgr.add_player("s1", "p1", "Alice")
    session = mgr.get_session("s1")
    assert session.players["p1"] == "Alice"


def test_remove_player_removes_from_session():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    mgr.add_player("s1", "p1", "Alice")
    mgr.remove_player("s1", "p1")
    session = mgr.get_session("s1")
    assert "p1" not in session.players


def test_add_player_on_missing_session_creates_placeholder():
    mgr = make_manager()
    mgr.add_player("s_new", "p1", "Bob")
    session = mgr.get_session("s_new")
    assert session is not None
    assert session.players["p1"] == "Bob"


def test_remove_player_on_missing_session_does_nothing():
    mgr = make_manager()
    # Should not raise
    mgr.remove_player("nonexistent_session", "p1")


def test_remove_player_on_missing_player_does_nothing():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    # Should not raise
    mgr.remove_player("s1", "nonexistent_player")


def test_add_pending_roll_appears_in_get_pending_rolls():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    roll = PendingRoll(
        roll_request_id="r1",
        player_id="p1",
        dice="1d20",
        skill="Perception",
        dc=15,
    )
    mgr.add_pending_roll("s1", roll)
    pending = mgr.get_pending_rolls_for_player("s1", "p1")
    assert len(pending) == 1
    assert pending[0].roll_request_id == "r1"


def test_resolve_pending_roll_returns_roll_and_removes_it():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    roll = PendingRoll(
        roll_request_id="r1",
        player_id="p1",
        dice="1d20",
        skill="Perception",
    )
    mgr.add_pending_roll("s1", roll)
    resolved = mgr.resolve_pending_roll("s1", "r1")
    assert resolved is not None
    assert resolved.roll_request_id == "r1"
    # Second call should return None since it was removed
    resolved_again = mgr.resolve_pending_roll("s1", "r1")
    assert resolved_again is None


def test_resolve_pending_roll_nonexistent_request_returns_none():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    result = mgr.resolve_pending_roll("s1", "nonexistent_request_id")
    assert result is None


def test_resolve_pending_roll_nonexistent_session_returns_none():
    mgr = make_manager()
    result = mgr.resolve_pending_roll("nonexistent_session", "r1")
    assert result is None


def test_end_session_removes_session():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    mgr.end_session("s1")
    assert mgr.get_session("s1") is None


def test_end_session_decrements_session_count():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    mgr.end_session("s1")
    assert mgr.session_count() == 0


def test_end_session_nonexistent_does_not_raise():
    mgr = make_manager()
    # Should not raise
    mgr.end_session("nonexistent")


def test_list_sessions_returns_all_session_ids():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    mgr.create_session("s2", "c2")
    mgr.create_session("s3", "c3")
    sessions = mgr.list_sessions()
    assert set(sessions) == {"s1", "s2", "s3"}


def test_get_pending_rolls_for_player_nonexistent_session_returns_empty():
    mgr = make_manager()
    result = mgr.get_pending_rolls_for_player("nonexistent", "p1")
    assert result == []


def test_get_pending_rolls_for_player_only_returns_matching_player():
    mgr = make_manager()
    mgr.create_session("s1", "c1")
    roll_p1 = PendingRoll(roll_request_id="r1", player_id="p1", dice="1d20", skill="Stealth")
    roll_p2 = PendingRoll(roll_request_id="r2", player_id="p2", dice="1d20", skill="Perception")
    mgr.add_pending_roll("s1", roll_p1)
    mgr.add_pending_roll("s1", roll_p2)

    p1_rolls = mgr.get_pending_rolls_for_player("s1", "p1")
    assert len(p1_rolls) == 1
    assert p1_rolls[0].player_id == "p1"

    p2_rolls = mgr.get_pending_rolls_for_player("s1", "p2")
    assert len(p2_rolls) == 1
    assert p2_rolls[0].player_id == "p2"


def test_pending_roll_with_dc_none():
    roll = PendingRoll(roll_request_id="r1", player_id="p1", dice="1d20", skill="Athletics")
    assert roll.dc is None


def test_pending_roll_with_dc_value():
    roll = PendingRoll(roll_request_id="r1", player_id="p1", dice="1d20", skill="Athletics", dc=15)
    assert roll.dc == 15

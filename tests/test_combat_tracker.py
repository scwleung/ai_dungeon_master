"""Tests for the in-memory combat tracker (GameStateManager combat methods)."""

import pytest
from backend.services.game_state import GameStateManager


@pytest.fixture
def mgr():
    return GameStateManager()


COMBATANTS_DATA = [
    {"name": "Goblin A", "initiative": 12, "hp_current": 8, "hp_max": 8, "is_player": False},
    {"name": "Aria", "initiative": 18, "hp_current": 30, "hp_max": 30, "is_player": True},
    {"name": "Goblin B", "initiative": 5, "hp_current": 8, "hp_max": 8, "is_player": False},
]


def test_start_combat_returns_active_state(mgr):
    state = mgr.start_combat("s1", COMBATANTS_DATA)
    assert state.active is True
    assert state.round == 1
    assert state.turn_index == 0
    assert len(state.combatants) == 3


def test_start_combat_sorts_by_initiative_descending(mgr):
    state = mgr.start_combat("s1", COMBATANTS_DATA)
    initiatives = [c.initiative for c in state.combatants]
    assert initiatives == sorted(initiatives, reverse=True)
    assert state.combatants[0].name == "Aria"
    assert state.combatants[1].name == "Goblin A"
    assert state.combatants[2].name == "Goblin B"


def test_advance_turn_increments_index(mgr):
    mgr.start_combat("s1", COMBATANTS_DATA)
    state = mgr.advance_turn("s1")
    assert state.turn_index == 1
    assert state.round == 1


def test_advance_turn_wraps_and_increments_round(mgr):
    mgr.start_combat("s1", COMBATANTS_DATA)
    # Advance past all 3 combatants
    mgr.advance_turn("s1")
    mgr.advance_turn("s1")
    state = mgr.advance_turn("s1")  # wraps to index 0
    assert state.turn_index == 0
    assert state.round == 2


def test_end_combat_clears_state(mgr):
    mgr.start_combat("s1", COMBATANTS_DATA)
    mgr.end_combat("s1")
    state = mgr.get_combat("s1")
    assert state.active is False
    assert state.combatants == []


def test_get_combat_returns_empty_when_none(mgr):
    state = mgr.get_combat("nonexistent_session")
    assert state.active is False
    assert state.combatants == []
    assert state.round == 1
    assert state.turn_index == 0


def test_current_combatant_returns_correct(mgr):
    state = mgr.start_combat("s1", COMBATANTS_DATA)
    current = state.current_combatant()
    assert current is not None
    assert current.name == "Aria"

    mgr.advance_turn("s1")
    state2 = mgr.get_combat("s1")
    current2 = state2.current_combatant()
    assert current2 is not None
    assert current2.name == "Goblin A"


def test_to_dict_structure(mgr):
    state = mgr.start_combat("s1", COMBATANTS_DATA)
    d = state.to_dict()
    assert d["active"] is True
    assert d["round"] == 1
    assert d["turn_index"] == 0
    assert len(d["combatants"]) == 3
    first = d["combatants"][0]
    assert "name" in first
    assert "initiative" in first
    assert "hp_current" in first
    assert "hp_max" in first
    assert "is_player" in first
    assert "character_id" in first
    assert "conditions" in first

"""Unit tests for Combatant and GameStateManager combat mechanics."""

from backend.services.game_state import Combatant, GameStateManager


def make_manager():
    return GameStateManager()


# ---------------------------------------------------------------------------
# Combatant defaults
# ---------------------------------------------------------------------------


def test_combatant_reaction_defaults_false():
    """A new Combatant has reaction_used = False."""
    c = Combatant(name="Goblin", initiative=10, hp_current=7, hp_max=7)
    assert c.reaction_used is False


def test_combatant_legendary_action_fields():
    """A new Combatant with legendary_actions_max=3 has legendary_actions_remaining=3."""
    c = Combatant(
        name="Dragon",
        initiative=20,
        hp_current=300,
        hp_max=300,
        legendary_actions_max=3,
        legendary_actions_remaining=3,
    )
    assert c.legendary_actions_max == 3
    assert c.legendary_actions_remaining == 3


def test_combatant_to_dict_includes_new_fields():
    """to_dict() includes reaction_used, legendary_actions_remaining, legendary_actions_max."""
    c = Combatant(
        name="Lich",
        initiative=18,
        hp_current=135,
        hp_max=135,
        legendary_actions_max=3,
        legendary_actions_remaining=3,
        reaction_used=True,
    )
    d = c.to_dict()
    assert "reaction_used" in d
    assert d["reaction_used"] is True
    assert "legendary_actions_remaining" in d
    assert d["legendary_actions_remaining"] == 3
    assert "legendary_actions_max" in d
    assert d["legendary_actions_max"] == 3


# ---------------------------------------------------------------------------
# GameStateManager.start_combat legendary action handling
# ---------------------------------------------------------------------------


def test_start_combat_with_legendary_actions():
    """start_combat with a combatant dict containing legendary_actions_max sets legendary_actions_remaining to that value."""
    mgr = make_manager()
    combatants_data = [
        {
            "name": "Ancient Dragon",
            "initiative": 20,
            "hp_current": 500,
            "hp_max": 500,
            "is_player": False,
            "legendary_actions_max": 3,
        },
        {
            "name": "Fighter",
            "initiative": 15,
            "hp_current": 50,
            "hp_max": 50,
            "is_player": True,
        },
    ]
    state = mgr.start_combat("session-1", combatants_data)
    dragon = next(c for c in state.combatants if c.name == "Ancient Dragon")
    assert dragon.legendary_actions_max == 3
    assert dragon.legendary_actions_remaining == 3


def test_start_combat_legendary_defaults_zero():
    """Combatant dict without legendary_actions_max defaults legendary_actions_remaining to 0."""
    mgr = make_manager()
    combatants_data = [
        {
            "name": "Orc",
            "initiative": 12,
            "hp_current": 15,
            "hp_max": 15,
            "is_player": False,
        }
    ]
    state = mgr.start_combat("session-2", combatants_data)
    orc = state.combatants[0]
    assert orc.legendary_actions_max == 0
    assert orc.legendary_actions_remaining == 0

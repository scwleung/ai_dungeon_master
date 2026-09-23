import os
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from backend.services.jev_shadow import SCHEMA_VERSION, build_state, enabled, evaluate_action


def test_shadow_disabled_without_api_key():
    with patch.dict(os.environ, {}, clear=True):
        assert enabled() is False


@pytest.mark.asyncio
async def test_disabled_shadow_is_fail_open():
    with patch.dict(os.environ, {}, clear=True):
        assert await evaluate_action(
            action_text="I inspect the door", player_name="Alice",
            campaign=SimpleNamespace(ruleset="dnd5e", description="", world_state="{}"),
            characters=[], history=[], in_combat=False,
        ) is None


def test_build_state_limits_history_and_parses_game_json():
    campaign = SimpleNamespace(ruleset="dnd5e", description="Test", world_state='{"location":"crypt"}')
    char = SimpleNamespace(name="Aria", player_name="Alice", class_name="Rogue", level=3,
                           hp_current=17, hp_max=20, stats='{"DEX":16}', conditions='["Prone"]')
    history = [{"role": "user", "text": f"message {i}"} for i in range(10)]
    state = build_state(action_text="I check for traps", player_name="Alice", campaign=campaign,
                        characters=[char], history=history, in_combat=False)
    assert state["world_state"]["location"] == "crypt"
    assert state["characters"][0]["stats"]["DEX"] == 16
    assert len(state["recent_history"]) == 6
    assert state["recent_history"][0]["text"] == "message 4"
    assert SCHEMA_VERSION == "action-adjudication-v1"

"""Tests for DungeonMaster from backend.services.dm_brain."""
import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.services.dm_brain import DungeonMaster


# ---------------------------------------------------------------------------
# Mock data classes
# ---------------------------------------------------------------------------


class MockCampaign:
    id = "camp1"
    name = "Test Campaign"
    ruleset = "dnd5e"
    description = "A test campaign"
    world_state = '{"current_location": "The tavern"}'


class MockCampaignFreeform:
    id = "camp2"
    name = "Story Campaign"
    ruleset = "freeform"
    description = ""
    world_state = "{}"


class MockCampaignPathfinder:
    id = "camp3"
    name = "PF2 Campaign"
    ruleset = "pathfinder2e"
    description = "A pathfinder campaign"
    world_state = "{}"


class MockCampaignUnknownRuleset:
    id = "camp4"
    name = "Weird Campaign"
    ruleset = "unknown_system"
    description = ""
    world_state = "{}"


class MockCharacter:
    id = "char1"
    name = "Thorin"
    player_name = "Alice"
    race = "Dwarf"
    class_name = "Fighter"
    level = 3
    hp_current = 25
    hp_max = 30
    stats = '{"STR": 16, "DEX": 10, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10}'
    inventory = '["Battleaxe", "Shield"]'
    conditions = '[]'
    notes = ""


def make_dm() -> DungeonMaster:
    """Return a DungeonMaster with a mock client, bypassing API key requirement."""
    dm = DungeonMaster.__new__(DungeonMaster)
    dm.client = AsyncMock()
    return dm


# ---------------------------------------------------------------------------
# _build_system_prompt tests
# ---------------------------------------------------------------------------


def test_build_system_prompt_dnd5e_ruleset_name():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaign(), [])
    assert "D&D 5th Edition" in prompt


def test_build_system_prompt_dnd5e_contains_campaign_name():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaign(), [])
    assert "Test Campaign" in prompt


def test_build_system_prompt_dnd5e_contains_character_name():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaign(), [MockCharacter()])
    assert "Thorin" in prompt


def test_build_system_prompt_dnd5e_contains_world_state_value():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaign(), [])
    assert "The tavern" in prompt


def test_build_system_prompt_pathfinder2e_ruleset_name():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaignPathfinder(), [])
    assert "Pathfinder 2nd Edition" in prompt


def test_build_system_prompt_freeform_ruleset_name():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaignFreeform(), [])
    assert "Freeform" in prompt


def test_build_system_prompt_unknown_ruleset_falls_back_to_freeform():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaignUnknownRuleset(), [])
    # Unknown ruleset uses UNKNOWN_SYSTEM.upper() as name and freeform description
    assert "Narrative-first freeform" in prompt


def test_build_system_prompt_empty_world_state_shows_no_state_message():
    dm = make_dm()
    prompt = dm._build_system_prompt(MockCampaignFreeform(), [])
    assert "No world state recorded yet" in prompt


# ---------------------------------------------------------------------------
# _format_characters tests
# ---------------------------------------------------------------------------


def test_format_characters_empty_list():
    dm = make_dm()
    result = dm._format_characters([])
    assert "No characters registered yet" in result


def test_format_characters_includes_name():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    assert "Thorin" in result


def test_format_characters_includes_player_name():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    assert "Alice" in result


def test_format_characters_includes_race_and_class():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    assert "Dwarf" in result
    assert "Fighter" in result


def test_format_characters_includes_hp():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    assert "25" in result
    assert "30" in result


def test_format_characters_includes_inventory_items():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    assert "Battleaxe" in result
    assert "Shield" in result


def test_format_characters_long_inventory_shows_more():
    dm = make_dm()

    class CharWithLongInventory:
        id = "char2"
        name = "Bob"
        player_name = "Charlie"
        race = "Human"
        class_name = "Wizard"
        level = 5
        hp_current = 20
        hp_max = 20
        stats = '{"STR": 8, "DEX": 12, "CON": 10, "INT": 18, "WIS": 14, "CHA": 10}'
        inventory = '["Wand", "Spellbook", "Potion", "Scroll", "Ring", "Staff", "Orb", "Hat", "Robe", "Boots"]'
        conditions = '[]'
        notes = ""

    result = dm._format_characters([CharWithLongInventory()])
    # Only first 5 shown, then "+5 more"
    assert "+5 more" in result


def test_format_characters_json_string_stats_parsed():
    dm = make_dm()
    result = dm._format_characters([MockCharacter()])
    # Stats string contains STR:16
    assert "STR" in result
    assert "16" in result


def test_format_characters_with_conditions():
    dm = make_dm()

    class CharWithConditions:
        id = "char3"
        name = "Aria"
        player_name = "Dave"
        race = "Elf"
        class_name = "Ranger"
        level = 4
        hp_current = 15
        hp_max = 28
        stats = '{"STR": 12, "DEX": 16, "CON": 12, "INT": 10, "WIS": 14, "CHA": 10}'
        inventory = '[]'
        conditions = '["Poisoned", "Prone"]'
        notes = ""

    result = dm._format_characters([CharWithConditions()])
    assert "Poisoned" in result
    assert "Prone" in result


# ---------------------------------------------------------------------------
# detect_dice tests
# ---------------------------------------------------------------------------


def _make_text_response(text: str):
    """Build a mock Anthropic response object returning the given text."""
    block = MagicMock()
    block.type = "text"
    block.text = text
    response = MagicMock()
    response.content = [block]
    return response


async def test_detect_dice_empty_array_returns_empty_list():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(return_value=_make_text_response("[]"))
    result = await dm.detect_dice("base64imagedata")
    assert result == []


async def test_detect_dice_valid_json_returns_parsed_list():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response('[{"sides": 20, "value": 15}, {"sides": 6, "value": 3}]')
    )
    result = await dm.detect_dice("base64imagedata")
    assert len(result) == 2
    assert result[0] == {"sides": 20, "value": 15}
    assert result[1] == {"sides": 6, "value": 3}


async def test_detect_dice_invalid_json_response_returns_empty():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("this is not json at all")
    )
    result = await dm.detect_dice("base64imagedata")
    assert result == []


async def test_detect_dice_on_api_error_returns_empty():
    from anthropic import APIError

    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        side_effect=APIError(message="err", request=MagicMock(), body=None)
    )
    result = await dm.detect_dice("base64imagedata")
    assert result == []


async def test_detect_dice_skips_items_missing_sides():
    dm = make_dm()
    # Item missing "sides" key — should be filtered out
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response('[{"value": 5}, {"sides": 6, "value": 3}]')
    )
    result = await dm.detect_dice("base64imagedata")
    assert len(result) == 1
    assert result[0] == {"sides": 6, "value": 3}


async def test_detect_dice_skips_items_missing_value():
    dm = make_dm()
    # Item missing "value" key — should be filtered out
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response('[{"sides": 20}, {"sides": 6, "value": 3}]')
    )
    result = await dm.detect_dice("base64imagedata")
    assert len(result) == 1
    assert result[0] == {"sides": 6, "value": 3}


# ---------------------------------------------------------------------------
# summarize_history tests
# ---------------------------------------------------------------------------


async def test_summarize_history_returns_text():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("The party defeated the goblin horde.")
    )
    result = await dm.summarize_history("USER: I attack.\nASSISTANT: You hit!")
    assert result == "The party defeated the goblin horde."


async def test_summarize_history_includes_existing_summary_in_prompt():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("Updated summary.")
    )
    await dm.summarize_history("USER: I look around.", existing_summary="Earlier: tavern brawl.")
    call_kwargs = dm.client.messages.create.call_args
    user_content = call_kwargs[1]["messages"][0]["content"]
    assert "Earlier: tavern brawl." in user_content
    assert "I look around." in user_content


async def test_summarize_history_no_existing_summary_omits_prefix():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("Summary.")
    )
    await dm.summarize_history("USER: Hi.")
    call_kwargs = dm.client.messages.create.call_args
    user_content = call_kwargs[1]["messages"][0]["content"]
    assert "Earlier summary:" not in user_content


async def test_summarize_history_uses_haiku_model():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("Summary text.")
    )
    await dm.summarize_history("USER: Go north.")
    call_kwargs = dm.client.messages.create.call_args
    assert "haiku" in call_kwargs[1]["model"]


async def test_summarize_history_system_prompt_mentions_rpg():
    dm = make_dm()
    dm.client.messages.create = AsyncMock(
        return_value=_make_text_response("Summary text.")
    )
    await dm.summarize_history("USER: I search the room.")
    call_kwargs = dm.client.messages.create.call_args
    system_text = call_kwargs[1]["system"]
    assert "RPG" in system_text or "tabletop" in system_text.lower()

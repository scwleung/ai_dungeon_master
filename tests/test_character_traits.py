"""Tests for PATCH /api/characters/{character_id} — character trait/feature fields."""
import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

CHARACTER_DATA = {
    "player_name": "Tester",
    "name": "Aria",
    "race": "Elf",
    "class_name": "Ranger",
    "level": 4,
    "hp_current": 32,
    "hp_max": 32,
    "stats": {"STR": 10, "DEX": 16, "CON": 12, "INT": 12, "WIS": 14, "CHA": 10},
    "inventory": [],
    "conditions": [],
    "notes": "",
}


async def make_campaign(client: AsyncClient) -> dict:
    r = await client.post("/api/campaigns/", json={"name": "Traits Campaign", "ruleset": "dnd5e"})
    assert r.status_code == 201
    return r.json()


def auth(campaign: dict) -> dict:
    return {"X-Access-Code": campaign["access_code"]}


async def make_character(client: AsyncClient, campaign: dict, data: dict = None) -> dict:
    payload = data if data is not None else CHARACTER_DATA
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=payload,
        headers=auth(campaign),
    )
    assert r.status_code == 201
    return r.json()


async def patch_character(client: AsyncClient, char_id: str, campaign: dict, body: dict) -> dict:
    r = await client.put(
        f"/api/characters/{char_id}",
        json=body,
        headers=auth(campaign),
    )
    assert r.status_code == 200
    return r.json()


# ---------------------------------------------------------------------------
# Bonds / Ideals / Flaws / Personality
# ---------------------------------------------------------------------------


async def test_update_bonds(client):
    """PATCH character with bonds → response includes the bonds value."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    updated = await patch_character(client, char["id"], campaign, {"bonds": "I protect the weak"})
    assert updated["bonds"] == "I protect the weak"


async def test_update_ideals(client):
    """PATCH character with ideals → response includes the ideals value."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    updated = await patch_character(client, char["id"], campaign, {"ideals": "Justice above all"})
    assert updated["ideals"] == "Justice above all"


async def test_update_flaws(client):
    """PATCH character with flaws → response includes the flaws value."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    updated = await patch_character(client, char["id"], campaign, {"flaws": "I trust too easily"})
    assert updated["flaws"] == "I trust too easily"


async def test_update_personality(client):
    """PATCH character with personality → response includes the personality value."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    updated = await patch_character(
        client, char["id"], campaign, {"personality": "Always cheerful"}
    )
    assert updated["personality"] == "Always cheerful"


# ---------------------------------------------------------------------------
# Languages / Tool proficiencies
# ---------------------------------------------------------------------------


async def test_update_languages(client):
    """PATCH with languages list → response languages is a list with those values."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    langs = ["Common", "Elvish"]
    updated = await patch_character(client, char["id"], campaign, {"languages": langs})
    assert isinstance(updated["languages"], list)
    assert updated["languages"] == langs


async def test_update_tool_proficiencies(client):
    """PATCH with tool_proficiencies list → response tool_proficiencies is a list."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    tools = ["Herbalism Kit", "Thieves' Tools"]
    updated = await patch_character(client, char["id"], campaign, {"tool_proficiencies": tools})
    assert isinstance(updated["tool_proficiencies"], list)
    assert updated["tool_proficiencies"] == tools


# ---------------------------------------------------------------------------
# Features
# ---------------------------------------------------------------------------


FEATURE_DATA = [
    {
        "id": "f1",
        "name": "Second Wind",
        "description": "Regain HP as a bonus action.",
        "uses_remaining": 1,
        "uses_max": 1,
        "recharge": "short",
    }
]


async def test_update_features(client):
    """PATCH with features list → response features is a list."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    updated = await patch_character(client, char["id"], campaign, {"features": FEATURE_DATA})
    assert isinstance(updated["features"], list)
    assert len(updated["features"]) == 1
    assert updated["features"][0]["name"] == "Second Wind"


async def test_feature_use_delta(client):
    """PATCH feature_use with delta=-1 decrements uses_remaining by 1."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)

    # First: set features with 1 use remaining
    await patch_character(client, char["id"], campaign, {"features": FEATURE_DATA})

    # Then: decrement that feature's uses_remaining by 1
    await patch_character(
        client,
        char["id"],
        campaign,
        {"feature_use": {"feature_id": "f1", "delta": -1}},
    )

    # Check the updated character via GET
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 200
    features = r.json()["features"]
    f1 = next((f for f in features if f["id"] == "f1"), None)
    assert f1 is not None
    # uses_remaining was 1, delta -1 → clamped to 0
    assert f1["uses_remaining"] == 0

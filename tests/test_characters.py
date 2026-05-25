"""Full HTTP integration tests for character endpoints."""
import pytest
from httpx import AsyncClient


CHARACTER_DATA = {
    "player_name": "Alice",
    "name": "Thorin",
    "race": "Dwarf",
    "class_name": "Fighter",
    "level": 3,
    "hp_current": 25,
    "hp_max": 30,
    "stats": {"STR": 16, "DEX": 10, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
    "inventory": ["Battleaxe", "Shield"],
    "conditions": [],
    "notes": "A warrior",
}


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


async def make_campaign(client: AsyncClient) -> str:
    r = await client.post("/api/campaigns/", json={"name": "Campaign", "ruleset": "dnd5e"})
    assert r.status_code == 201
    return r.json()["id"]


async def make_character(client: AsyncClient, campaign_id: str, data: dict = None) -> dict:
    payload = data if data is not None else CHARACTER_DATA
    r = await client.post(f"/api/{campaign_id}/characters", json=payload)
    assert r.status_code == 201
    return r.json()


# ---------------------------------------------------------------------------
# Create character tests
# ---------------------------------------------------------------------------


async def test_create_character_status_201(client):
    campaign_id = await make_campaign(client)
    r = await client.post(f"/api/{campaign_id}/characters", json=CHARACTER_DATA)
    assert r.status_code == 201


async def test_create_character_correct_name(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["name"] == "Thorin"


async def test_create_character_correct_player_name(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["player_name"] == "Alice"


async def test_create_character_correct_race(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["race"] == "Dwarf"


async def test_create_character_correct_class_name(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["class_name"] == "Fighter"


async def test_create_character_correct_level(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["level"] == 3


async def test_create_character_correct_hp(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert char["hp_current"] == 25
    assert char["hp_max"] == 30


async def test_create_character_inventory_is_list(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert isinstance(char["inventory"], list)
    assert "Battleaxe" in char["inventory"]
    assert "Shield" in char["inventory"]


async def test_create_character_stats_is_dict(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert isinstance(char["stats"], dict)
    assert char["stats"]["STR"] == 16


async def test_create_character_has_id(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    assert "id" in char
    assert char["id"]


async def test_create_character_nonexistent_campaign_returns_404(client):
    r = await client.post(
        "/api/nonexistent-campaign-id/characters",
        json=CHARACTER_DATA,
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# List character tests
# ---------------------------------------------------------------------------


async def test_list_characters_empty_status_200(client):
    campaign_id = await make_campaign(client)
    r = await client.get(f"/api/{campaign_id}/characters")
    assert r.status_code == 200


async def test_list_characters_empty_returns_empty_list(client):
    campaign_id = await make_campaign(client)
    r = await client.get(f"/api/{campaign_id}/characters")
    assert r.json() == []


async def test_list_characters_after_creating_returns_one(client):
    campaign_id = await make_campaign(client)
    await make_character(client, campaign_id)
    r = await client.get(f"/api/{campaign_id}/characters")
    assert len(r.json()) == 1


async def test_list_characters_nonexistent_campaign_returns_404(client):
    r = await client.get("/api/nonexistent-campaign-id/characters")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Get character tests
# ---------------------------------------------------------------------------


async def test_get_character_by_id_status_200(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 200


async def test_get_character_by_id_correct_data(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.json()["id"] == char["id"]
    assert r.json()["name"] == "Thorin"


async def test_get_nonexistent_character_returns_404(client):
    r = await client.get("/api/characters/nonexistent-char-id-00000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update character tests
# ---------------------------------------------------------------------------


async def test_update_character_hp_current_status_200(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(f"/api/characters/{char['id']}", json={"hp_current": 10})
    assert r.status_code == 200


async def test_update_character_hp_current_changed(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(f"/api/characters/{char['id']}", json={"hp_current": 10})
    assert r.json()["hp_current"] == 10


async def test_update_character_hp_current_hp_max_unchanged(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(f"/api/characters/{char['id']}", json={"hp_current": 10})
    assert r.json()["hp_max"] == 30


async def test_update_character_inventory(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    new_inventory = ["Longsword", "Healing Potion", "Rope"]
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"inventory": new_inventory},
    )
    assert r.json()["inventory"] == new_inventory


async def test_update_character_conditions(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"conditions": ["Poisoned"]},
    )
    assert "Poisoned" in r.json()["conditions"]


async def test_update_character_notes(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"notes": "Updated notes here"},
    )
    assert r.json()["notes"] == "Updated notes here"


async def test_update_character_level(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.put(f"/api/characters/{char['id']}", json={"level": 5})
    assert r.json()["level"] == 5


async def test_update_character_stats(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    new_stats = {"STR": 20, "DEX": 14, "CON": 16, "INT": 10, "WIS": 12, "CHA": 8}
    r = await client.put(f"/api/characters/{char['id']}", json={"stats": new_stats})
    assert r.json()["stats"]["STR"] == 20


async def test_update_nonexistent_character_returns_404(client):
    r = await client.put(
        "/api/characters/nonexistent-char-id-00000000",
        json={"hp_current": 5},
    )
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Delete character tests
# ---------------------------------------------------------------------------


async def test_delete_character_status_204(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    r = await client.delete(f"/api/characters/{char['id']}")
    assert r.status_code == 204


async def test_delete_character_then_get_returns_404(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    await client.delete(f"/api/characters/{char['id']}")
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 404


async def test_delete_nonexistent_character_returns_404(client):
    r = await client.delete("/api/characters/nonexistent-char-id-00000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Cascade delete tests
# ---------------------------------------------------------------------------


async def test_delete_campaign_cascades_to_characters(client):
    campaign_id = await make_campaign(client)
    char = await make_character(client, campaign_id)
    await client.delete(f"/api/campaigns/{campaign_id}")
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Multi-character tests
# ---------------------------------------------------------------------------


async def test_two_characters_in_same_campaign_list_returns_two(client):
    campaign_id = await make_campaign(client)
    char_data_2 = {**CHARACTER_DATA, "name": "Elara", "player_name": "Bob"}
    await make_character(client, campaign_id, CHARACTER_DATA)
    await make_character(client, campaign_id, char_data_2)
    r = await client.get(f"/api/{campaign_id}/characters")
    assert len(r.json()) == 2


async def test_characters_from_different_campaigns_not_mixed(client):
    campaign_a = await make_campaign(client)
    campaign_b = await make_campaign(client)

    char_a_data = {**CHARACTER_DATA, "name": "Thorin"}
    char_b_data = {**CHARACTER_DATA, "name": "Elara", "player_name": "Bob"}

    await make_character(client, campaign_a, char_a_data)
    await make_character(client, campaign_b, char_b_data)

    r_a = await client.get(f"/api/{campaign_a}/characters")
    r_b = await client.get(f"/api/{campaign_b}/characters")

    names_a = [c["name"] for c in r_a.json()]
    names_b = [c["name"] for c in r_b.json()]

    assert "Thorin" in names_a
    assert "Elara" not in names_a
    assert "Elara" in names_b
    assert "Thorin" not in names_b

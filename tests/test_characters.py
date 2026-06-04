"""Full HTTP integration tests for character endpoints."""
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
# Helpers
# ---------------------------------------------------------------------------


async def make_campaign(client: AsyncClient) -> dict:
    r = await client.post("/api/campaigns/", json={"name": "Campaign", "ruleset": "dnd5e"})
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


# ---------------------------------------------------------------------------
# Create character tests
# ---------------------------------------------------------------------------


async def test_create_character_status_201(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=CHARACTER_DATA,
        headers=auth(campaign),
    )
    assert r.status_code == 201


async def test_create_character_correct_name(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["name"] == "Thorin"


async def test_create_character_correct_player_name(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["player_name"] == "Alice"


async def test_create_character_correct_race(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["race"] == "Dwarf"


async def test_create_character_correct_class_name(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["class_name"] == "Fighter"


async def test_create_character_correct_level(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["level"] == 3


async def test_create_character_correct_hp(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert char["hp_current"] == 25
    assert char["hp_max"] == 30


async def test_create_character_inventory_is_list(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert isinstance(char["inventory"], list)
    assert "Battleaxe" in char["inventory"]
    assert "Shield" in char["inventory"]


async def test_create_character_stats_is_dict(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert isinstance(char["stats"], dict)
    assert char["stats"]["STR"] == 16


async def test_create_character_has_id(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    assert "id" in char
    assert char["id"]


async def test_create_character_nonexistent_campaign_returns_404(client):
    r = await client.post(
        "/api/nonexistent-campaign-id/characters",
        json=CHARACTER_DATA,
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_create_character_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=CHARACTER_DATA,
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# List character tests
# ---------------------------------------------------------------------------


async def test_list_characters_empty_status_200(client):
    campaign = await make_campaign(client)
    r = await client.get(f"/api/{campaign['id']}/characters")
    assert r.status_code == 200


async def test_list_characters_empty_returns_empty_list(client):
    campaign = await make_campaign(client)
    r = await client.get(f"/api/{campaign['id']}/characters")
    assert r.json() == []


async def test_list_characters_after_creating_returns_one(client):
    campaign = await make_campaign(client)
    await make_character(client, campaign)
    r = await client.get(f"/api/{campaign['id']}/characters")
    assert len(r.json()) == 1


async def test_list_characters_nonexistent_campaign_returns_404(client):
    r = await client.get("/api/nonexistent-campaign-id/characters")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Get character tests
# ---------------------------------------------------------------------------


async def test_get_character_by_id_status_200(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 200


async def test_get_character_by_id_correct_data(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
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
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"hp_current": 10},
        headers=auth(campaign),
    )
    assert r.status_code == 200


async def test_update_character_hp_current_changed(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"hp_current": 10},
        headers=auth(campaign),
    )
    assert r.json()["hp_current"] == 10


async def test_update_character_hp_current_hp_max_unchanged(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"hp_current": 10},
        headers=auth(campaign),
    )
    assert r.json()["hp_max"] == 30


async def test_update_character_inventory(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    new_inventory = ["Longsword", "Healing Potion", "Rope"]
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"inventory": new_inventory},
        headers=auth(campaign),
    )
    assert r.json()["inventory"] == new_inventory


async def test_update_character_conditions(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"conditions": ["Poisoned"]},
        headers=auth(campaign),
    )
    assert "Poisoned" in r.json()["conditions"]


async def test_update_character_notes(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"notes": "Updated notes here"},
        headers=auth(campaign),
    )
    assert r.json()["notes"] == "Updated notes here"


async def test_update_character_level(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"level": 5},
        headers=auth(campaign),
    )
    assert r.json()["level"] == 5


async def test_update_character_stats(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    new_stats = {"STR": 20, "DEX": 14, "CON": 16, "INT": 10, "WIS": 12, "CHA": 8}
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"stats": new_stats},
        headers=auth(campaign),
    )
    assert r.json()["stats"]["STR"] == 20


async def test_update_nonexistent_character_returns_404(client):
    r = await client.put(
        "/api/characters/nonexistent-char-id-00000000",
        json={"hp_current": 5},
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_update_character_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"hp_current": 1},
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Delete character tests
# ---------------------------------------------------------------------------


async def test_delete_character_status_204(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.delete(f"/api/characters/{char['id']}", headers=auth(campaign))
    assert r.status_code == 204


async def test_delete_character_then_get_returns_404(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    await client.delete(f"/api/characters/{char['id']}", headers=auth(campaign))
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 404


async def test_delete_nonexistent_character_returns_404(client):
    r = await client.delete(
        "/api/characters/nonexistent-char-id-00000000",
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_delete_character_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.delete(
        f"/api/characters/{char['id']}",
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Cascade delete tests
# ---------------------------------------------------------------------------


async def test_delete_campaign_cascades_to_characters(client):
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    await client.delete(f"/api/campaigns/{campaign['id']}", headers=auth(campaign))
    r = await client.get(f"/api/characters/{char['id']}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Multi-character tests
# ---------------------------------------------------------------------------


async def test_two_characters_in_same_campaign_list_returns_two(client):
    campaign = await make_campaign(client)
    char_data_2 = {**CHARACTER_DATA, "name": "Elara", "player_name": "Bob"}
    await make_character(client, campaign, CHARACTER_DATA)
    await make_character(client, campaign, char_data_2)
    r = await client.get(f"/api/{campaign['id']}/characters")
    assert len(r.json()) == 2


async def test_characters_from_different_campaigns_not_mixed(client):
    campaign_a = await make_campaign(client)
    campaign_b = await make_campaign(client)

    char_a_data = {**CHARACTER_DATA, "name": "Thorin"}
    char_b_data = {**CHARACTER_DATA, "name": "Elara", "player_name": "Bob"}

    await make_character(client, campaign_a, char_a_data)
    await make_character(client, campaign_b, char_b_data)

    r_a = await client.get(f"/api/{campaign_a['id']}/characters")
    r_b = await client.get(f"/api/{campaign_b['id']}/characters")

    names_a = [c["name"] for c in r_a.json()]
    names_b = [c["name"] for c in r_b.json()]

    assert "Thorin" in names_a
    assert "Elara" not in names_a
    assert "Elara" in names_b
    assert "Thorin" not in names_b


# ---------------------------------------------------------------------------
# Input validation limit tests (CharacterCreate — Pydantic Field constraints)
# ---------------------------------------------------------------------------


async def test_create_character_player_name_too_long_returns_422(client):
    """player_name max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "player_name": "A" * 101}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_player_name_empty_returns_422(client):
    """player_name min_length=1 — empty string must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "player_name": ""}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_name_too_long_returns_422(client):
    """name max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "name": "B" * 101}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_name_empty_returns_422(client):
    """name min_length=1 — empty string must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "name": ""}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_race_too_long_returns_422(client):
    """race max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "race": "R" * 101}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_class_name_too_long_returns_422(client):
    """class_name max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "class_name": "C" * 101}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_level_above_max_returns_422(client):
    """level le=30 — value above 30 must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "level": 31}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_level_zero_returns_422(client):
    """level ge=1 — value of 0 must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "level": 0}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_level_30_accepted(client):
    """level le=30 — boundary value 30 must be accepted."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "level": 30}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 201
    assert r.json()["level"] == 30


async def test_create_character_hp_current_negative_returns_422(client):
    """hp_current ge=0 — negative value must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "hp_current": -1}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_hp_current_zero_accepted(client):
    """hp_current ge=0 — boundary value 0 must be accepted (character at 0 HP)."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "hp_current": 0}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 201
    assert r.json()["hp_current"] == 0


async def test_create_character_hp_over_max_returns_422(client):
    """hp_current le=9999 — value above 9999 must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "hp_current": 10_000}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_hp_max_over_limit_returns_422(client):
    """hp_max le=9999 — value above 9999 must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "hp_max": 10_000}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_notes_too_long_returns_422(client):
    """notes max_length=10_000 — over-limit must return 422."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "notes": "N" * 10_001}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_create_character_notes_at_max_length_accepted(client):
    """notes max_length=10_000 — exactly 10 000 chars must be accepted."""
    campaign = await make_campaign(client)
    data = {**CHARACTER_DATA, "notes": "N" * 10_000}
    r = await client.post(
        f"/api/{campaign['id']}/characters",
        json=data,
        headers=auth(campaign),
    )
    assert r.status_code == 201


# ---------------------------------------------------------------------------
# Input validation limit tests for CharacterUpdate
# ---------------------------------------------------------------------------


async def test_update_character_player_name_too_long_returns_422(client):
    """CharacterUpdate.player_name max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"player_name": "A" * 101},
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_update_character_name_too_long_returns_422(client):
    """CharacterUpdate.name max_length=100 — over-limit must return 422."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"name": "B" * 101},
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_update_character_level_above_max_returns_422(client):
    """CharacterUpdate.level le=30 — value above 30 must return 422."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"level": 31},
        headers=auth(campaign),
    )
    assert r.status_code == 422


async def test_update_character_notes_too_long_returns_422(client):
    """CharacterUpdate.notes max_length=10_000 — over-limit must return 422."""
    campaign = await make_campaign(client)
    char = await make_character(client, campaign)
    r = await client.put(
        f"/api/characters/{char['id']}",
        json={"notes": "N" * 10_001},
        headers=auth(campaign),
    )
    assert r.status_code == 422

"""Tests for random table endpoints under /api/campaigns/{campaign_id}/tables."""
import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def make_campaign(client: AsyncClient) -> dict:
    r = await client.post("/api/campaigns/", json={"name": "Tables Campaign", "ruleset": "dnd5e"})
    assert r.status_code == 201
    return r.json()


def auth(campaign: dict) -> dict:
    return {"X-Access-Code": campaign["access_code"]}


async def make_table(client: AsyncClient, campaign: dict, body: dict = None) -> dict:
    if body is None:
        body = {"name": "Encounter Table", "dice": "d6", "entries": ["Goblin", "Orc", "Troll"]}
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables", json=body)
    assert r.status_code == 200
    return r.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_get_tables_empty(client):
    """A newly created campaign has no random tables."""
    campaign = await make_campaign(client)
    r = await client.get(f"/api/campaigns/{campaign['id']}/tables")
    assert r.status_code == 200
    assert r.json() == []


async def test_create_table(client):
    """POST creates a table and returns it with an id."""
    campaign = await make_campaign(client)
    body = {"name": "Loot Table", "dice": "d8", "entries": ["Gold", "Sword", "Potion"]}
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables", json=body)
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["id"]
    assert data["name"] == "Loot Table"
    assert data["dice"] == "d8"
    assert data["entries"] == ["Gold", "Sword", "Potion"]


async def test_create_table_missing_name(client):
    """POST without a name field defaults to 'Unnamed Table'."""
    campaign = await make_campaign(client)
    body = {"dice": "d6", "entries": ["Entry A", "Entry B"]}
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables", json=body)
    assert r.status_code == 200
    assert r.json()["name"] == "Unnamed Table"


async def test_roll_table(client):
    """POST roll returns {'result': str, 'table': str}."""
    campaign = await make_campaign(client)
    table = await make_table(client, campaign)
    table_id = table["id"]
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables/{table_id}/roll")
    assert r.status_code == 200
    data = r.json()
    assert "result" in data
    assert "table" in data
    assert isinstance(data["result"], str)
    assert data["result"] in ["Goblin", "Orc", "Troll"]
    assert data["table"] == "Encounter Table"


async def test_roll_empty_table(client):
    """POST roll on a table with no entries returns 400."""
    campaign = await make_campaign(client)
    table = await make_table(client, campaign, {"name": "Empty Table", "dice": "d6", "entries": []})
    table_id = table["id"]
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables/{table_id}/roll")
    assert r.status_code == 400


async def test_roll_nonexistent_table(client):
    """POST roll on a nonexistent table id returns 404."""
    campaign = await make_campaign(client)
    r = await client.post(f"/api/campaigns/{campaign['id']}/tables/nonexistent-table-id/roll")
    assert r.status_code == 404


async def test_delete_table(client):
    """DELETE removes the table; subsequent GET returns empty list."""
    campaign = await make_campaign(client)
    table = await make_table(client, campaign)
    table_id = table["id"]

    r = await client.delete(f"/api/campaigns/{campaign['id']}/tables/{table_id}")
    assert r.status_code == 200

    r = await client.get(f"/api/campaigns/{campaign['id']}/tables")
    assert r.status_code == 200
    assert r.json() == []


async def test_tables_on_nonexistent_campaign_get(client):
    """GET tables on a nonexistent campaign returns 404."""
    r = await client.get("/api/campaigns/nonexistent-campaign-id-000/tables")
    assert r.status_code == 404


async def test_tables_on_nonexistent_campaign_post(client):
    """POST table on a nonexistent campaign returns 404."""
    r = await client.post(
        "/api/campaigns/nonexistent-campaign-id-000/tables",
        json={"name": "My Table", "dice": "d6", "entries": ["A"]},
    )
    assert r.status_code == 404

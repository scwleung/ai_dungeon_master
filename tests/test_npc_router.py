"""Tests for the NPC registry endpoint (GET /api/campaigns/{id}/npcs)."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_npcs_returns_empty_for_new_campaign(client: AsyncClient):
    """A freshly created campaign should return an empty NPC list."""
    # Create a campaign first
    create_resp = await client.post(
        "/api/campaigns/",
        json={"name": "NPC Test Campaign", "ruleset": "dnd5e", "description": ""},
    )
    assert create_resp.status_code == 201
    campaign = create_resp.json()
    campaign_id = campaign["id"]

    # Fetch NPCs — should be empty
    resp = await client.get(f"/api/campaigns/{campaign_id}/npcs")
    assert resp.status_code == 200
    body = resp.json()
    assert body["campaign_id"] == campaign_id
    assert body["npcs"] == []


@pytest.mark.asyncio
async def test_list_npcs_returns_404_for_unknown_campaign(client: AsyncClient):
    """Requesting NPCs for a non-existent campaign should return 404."""
    fake_id = str(uuid.uuid4())
    resp = await client.get(f"/api/campaigns/{fake_id}/npcs")
    assert resp.status_code == 404

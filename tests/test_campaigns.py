"""Full HTTP integration tests for campaign and session endpoints."""
import pytest
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def make_campaign(client: AsyncClient, name="Test", ruleset="dnd5e", description=""):
    r = await client.post(
        "/api/campaigns/",
        json={"name": name, "ruleset": ruleset, "description": description},
    )
    assert r.status_code == 201
    return r.json()


def auth(campaign: dict) -> dict:
    """Return X-Access-Code header dict for a campaign."""
    return {"X-Access-Code": campaign["access_code"]}


# ---------------------------------------------------------------------------
# Campaign list tests
# ---------------------------------------------------------------------------


async def test_list_campaigns_empty(client):
    r = await client.get("/api/campaigns/")
    assert r.status_code == 200
    assert r.json() == []


# ---------------------------------------------------------------------------
# Campaign creation tests
# ---------------------------------------------------------------------------


async def test_create_campaign_status_201(client):
    r = await client.post(
        "/api/campaigns/",
        json={"name": "My Campaign", "ruleset": "dnd5e", "description": "A great adventure"},
    )
    assert r.status_code == 201


async def test_create_campaign_correct_name(client):
    data = await make_campaign(client, name="Epic Quest")
    assert data["name"] == "Epic Quest"


async def test_create_campaign_correct_ruleset(client):
    data = await make_campaign(client, ruleset="pathfinder2e")
    assert data["ruleset"] == "pathfinder2e"


async def test_create_campaign_correct_description(client):
    data = await make_campaign(client, description="A tale of heroes")
    assert data["description"] == "A tale of heroes"


async def test_create_campaign_session_count_zero(client):
    data = await make_campaign(client)
    assert data["session_count"] == 0


async def test_create_campaign_has_id(client):
    data = await make_campaign(client)
    assert "id" in data
    assert data["id"]


async def test_create_campaign_has_access_code(client):
    data = await make_campaign(client)
    assert "access_code" in data
    assert len(data["access_code"]) > 0


async def test_create_campaign_default_ruleset(client):
    r = await client.post("/api/campaigns/", json={"name": "Default Ruleset Campaign"})
    assert r.status_code == 201
    assert r.json()["ruleset"] == "dnd5e"


async def test_create_campaign_dnd5e_ruleset(client):
    data = await make_campaign(client, ruleset="dnd5e")
    assert data["ruleset"] == "dnd5e"


async def test_create_campaign_pathfinder2e_ruleset(client):
    data = await make_campaign(client, ruleset="pathfinder2e")
    assert data["ruleset"] == "pathfinder2e"


async def test_create_campaign_freeform_ruleset(client):
    data = await make_campaign(client, ruleset="freeform")
    assert data["ruleset"] == "freeform"


async def test_create_campaign_invalid_ruleset_returns_422(client):
    r = await client.post(
        "/api/campaigns/",
        json={"name": "Bad", "ruleset": "invalid_system"},
    )
    assert r.status_code == 422


async def test_create_campaign_empty_name_succeeds(client):
    r = await client.post("/api/campaigns/", json={"name": "", "ruleset": "dnd5e"})
    assert r.status_code == 201


async def test_create_campaign_world_state_is_empty_dict(client):
    data = await make_campaign(client)
    assert data["world_state"] == {}


# ---------------------------------------------------------------------------
# Get campaign tests
# ---------------------------------------------------------------------------


async def test_get_campaign_by_id_status_200(client):
    campaign = await make_campaign(client)
    r = await client.get(f"/api/campaigns/{campaign['id']}")
    assert r.status_code == 200


async def test_get_campaign_by_id_correct_id(client):
    campaign = await make_campaign(client)
    r = await client.get(f"/api/campaigns/{campaign['id']}")
    assert r.json()["id"] == campaign["id"]


async def test_get_nonexistent_campaign_returns_404(client):
    r = await client.get("/api/campaigns/nonexistent-id-00000000")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Update campaign tests
# ---------------------------------------------------------------------------


async def test_update_campaign_name_status_200(client):
    campaign = await make_campaign(client, name="Old Name")
    r = await client.put(
        f"/api/campaigns/{campaign['id']}",
        json={"name": "New Name"},
        headers=auth(campaign),
    )
    assert r.status_code == 200


async def test_update_campaign_name_changed(client):
    campaign = await make_campaign(client, name="Old Name", description="Old Desc")
    r = await client.put(
        f"/api/campaigns/{campaign['id']}",
        json={"name": "New Name"},
        headers=auth(campaign),
    )
    assert r.json()["name"] == "New Name"


async def test_update_campaign_name_description_unchanged(client):
    campaign = await make_campaign(client, name="Old Name", description="Keep this")
    r = await client.put(
        f"/api/campaigns/{campaign['id']}",
        json={"name": "New Name"},
        headers=auth(campaign),
    )
    assert r.json()["description"] == "Keep this"


async def test_update_campaign_description_only(client):
    campaign = await make_campaign(client, name="Keep Name", description="Old Desc")
    r = await client.put(
        f"/api/campaigns/{campaign['id']}",
        json={"description": "New Desc"},
        headers=auth(campaign),
    )
    assert r.json()["name"] == "Keep Name"
    assert r.json()["description"] == "New Desc"


async def test_update_nonexistent_campaign_returns_404(client):
    r = await client.put(
        "/api/campaigns/nonexistent-id-00000000",
        json={"name": "Irrelevant"},
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_update_campaign_wrong_code_returns_403(client):
    campaign = await make_campaign(client, name="Secret")
    r = await client.put(
        f"/api/campaigns/{campaign['id']}",
        json={"name": "Hacked"},
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# Delete campaign tests
# ---------------------------------------------------------------------------


async def test_delete_campaign_status_204(client):
    campaign = await make_campaign(client)
    r = await client.delete(f"/api/campaigns/{campaign['id']}", headers=auth(campaign))
    assert r.status_code == 204


async def test_delete_campaign_then_get_returns_404(client):
    campaign = await make_campaign(client)
    await client.delete(f"/api/campaigns/{campaign['id']}", headers=auth(campaign))
    r = await client.get(f"/api/campaigns/{campaign['id']}")
    assert r.status_code == 404


async def test_delete_nonexistent_campaign_returns_404(client):
    r = await client.delete(
        "/api/campaigns/nonexistent-id-00000000",
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_delete_campaign_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    r = await client.delete(
        f"/api/campaigns/{campaign['id']}",
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


# ---------------------------------------------------------------------------
# List campaigns ordering
# ---------------------------------------------------------------------------


async def test_list_campaigns_returns_multiple(client):
    await make_campaign(client, name="Campaign A")
    await make_campaign(client, name="Campaign B")
    await make_campaign(client, name="Campaign C")
    r = await client.get("/api/campaigns/")
    assert r.status_code == 200
    assert len(r.json()) == 3


async def test_list_campaigns_descending_creation_order(client):
    await make_campaign(client, name="First")
    await make_campaign(client, name="Second")
    await make_campaign(client, name="Third")
    r = await client.get("/api/campaigns/")
    names = [c["name"] for c in r.json()]
    # Descending order: Third first, First last
    assert names[0] == "Third"
    assert names[-1] == "First"


# ---------------------------------------------------------------------------
# Session tests
# ---------------------------------------------------------------------------


async def test_start_session_status_201(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    assert r.status_code == 201


async def test_start_session_campaign_id_matches(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    assert r.json()["campaign_id"] == campaign["id"]


async def test_start_session_ended_at_is_none(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    assert r.json()["ended_at"] is None


async def test_start_session_messages_is_empty_list(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    assert r.json()["messages"] == []


async def test_start_session_nonexistent_campaign_returns_404(client):
    r = await client.post(
        "/api/campaigns/nonexistent-id-00000000/sessions",
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_start_session_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


async def test_end_session_status_200(client):
    campaign = await make_campaign(client)
    session_r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    session_id = session_r.json()["id"]
    r = await client.put(
        f"/api/campaigns/sessions/{session_id}/end",
        headers=auth(campaign),
    )
    assert r.status_code == 200


async def test_end_session_ended_at_is_not_none(client):
    campaign = await make_campaign(client)
    session_r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    session_id = session_r.json()["id"]
    r = await client.put(
        f"/api/campaigns/sessions/{session_id}/end",
        headers=auth(campaign),
    )
    assert r.json()["ended_at"] is not None


async def test_end_session_already_ended_is_idempotent(client):
    campaign = await make_campaign(client)
    session_r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    session_id = session_r.json()["id"]
    await client.put(
        f"/api/campaigns/sessions/{session_id}/end",
        headers=auth(campaign),
    )
    r = await client.put(
        f"/api/campaigns/sessions/{session_id}/end",
        headers=auth(campaign),
    )
    assert r.status_code == 200


async def test_end_nonexistent_session_returns_404(client):
    r = await client.put(
        "/api/campaigns/sessions/nonexistent-session-id/end",
        headers={"X-Access-Code": "any"},
    )
    assert r.status_code == 404


async def test_end_session_wrong_code_returns_403(client):
    campaign = await make_campaign(client)
    session_r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    session_id = session_r.json()["id"]
    r = await client.put(
        f"/api/campaigns/sessions/{session_id}/end",
        headers={"X-Access-Code": "wrong-code"},
    )
    assert r.status_code == 403


async def test_list_sessions_for_campaign_status_200(client):
    campaign = await make_campaign(client)
    r = await client.get(f"/api/campaigns/{campaign['id']}/sessions")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


async def test_list_sessions_for_nonexistent_campaign_returns_404(client):
    r = await client.get("/api/campaigns/nonexistent-id-00000000/sessions")
    assert r.status_code == 404


async def test_session_count_increments_after_starting_session(client):
    campaign = await make_campaign(client)
    await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    r = await client.get(f"/api/campaigns/{campaign['id']}")
    assert r.json()["session_count"] == 1


async def test_delete_campaign_cascades_to_sessions(client):
    campaign = await make_campaign(client)
    await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    await client.delete(f"/api/campaigns/{campaign['id']}", headers=auth(campaign))

    # Sessions for the deleted campaign should 404
    r = await client.get(f"/api/campaigns/{campaign['id']}/sessions")
    assert r.status_code == 404

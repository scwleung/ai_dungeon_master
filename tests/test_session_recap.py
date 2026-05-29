"""Tests for POST /api/campaigns/sessions/{session_id}/recap endpoint."""
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def make_campaign(client: AsyncClient) -> dict:
    r = await client.post("/api/campaigns/", json={"name": "Recap Campaign", "ruleset": "dnd5e"})
    assert r.status_code == 201
    return r.json()


def auth(campaign: dict) -> dict:
    return {"X-Access-Code": campaign["access_code"]}


async def make_session(client: AsyncClient, campaign: dict) -> dict:
    r = await client.post(
        f"/api/campaigns/{campaign['id']}/sessions",
        headers=auth(campaign),
    )
    assert r.status_code == 201
    return r.json()


def make_mock_anthropic(recap_text: str = "Previously on..."):
    """Build a mock AsyncAnthropic client that returns a fixed recap text."""
    mock_content = MagicMock()
    mock_content.text = recap_text

    mock_response = MagicMock()
    mock_response.content = [mock_content]

    mock_messages = AsyncMock()
    mock_messages.create = AsyncMock(return_value=mock_response)

    mock_client = MagicMock()
    mock_client.messages = mock_messages

    return mock_client


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_generate_recap_success(client):
    """Mock Anthropic, POST recap, returns {'recap': 'Previously on...'} with 200."""
    campaign = await make_campaign(client)
    session = await make_session(client, campaign)
    session_id = session["id"]

    mock_client = make_mock_anthropic("Previously on...")

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        r = await client.post(f"/api/campaigns/sessions/{session_id}/recap")

    assert r.status_code == 200
    data = r.json()
    assert "recap" in data
    assert data["recap"] == "Previously on..."


async def test_generate_recap_nonexistent_session(client):
    """POST recap on a nonexistent session returns 404."""
    mock_client = make_mock_anthropic()

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        r = await client.post("/api/campaigns/sessions/nonexistent-session-id-000/recap")

    assert r.status_code == 404


async def test_generate_recap_no_notes(client):
    """Session with empty notes still succeeds (uses 'No notes recorded' fallback)."""
    campaign = await make_campaign(client)
    session = await make_session(client, campaign)
    session_id = session["id"]

    # Session was just created — notes are empty by default
    recap_text = "No adventures yet, but the party is ready."
    mock_client = make_mock_anthropic(recap_text)

    with patch("anthropic.AsyncAnthropic", return_value=mock_client):
        r = await client.post(f"/api/campaigns/sessions/{session_id}/recap")

    assert r.status_code == 200
    data = r.json()
    assert "recap" in data
    assert data["recap"] == recap_text

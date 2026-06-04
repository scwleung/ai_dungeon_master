"""Tests for GET /health endpoint."""
import os
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient, ASGITransport

os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-for-ci")

from backend.main import app


# ---------------------------------------------------------------------------
# DB reachable — 200 ok
# ---------------------------------------------------------------------------


async def test_health_returns_200(client):
    r = await client.get("/health")
    assert r.status_code == 200


async def test_health_returns_status_ok(client):
    r = await client.get("/health")
    data = r.json()
    assert data["status"] == "ok"


async def test_health_returns_db_ok(client):
    r = await client.get("/health")
    data = r.json()
    assert data["db"] == "ok"


# ---------------------------------------------------------------------------
# DB unreachable — 503 degraded
# ---------------------------------------------------------------------------


def _broken_db_cm():
    """Return a context manager that raises on __aenter__ to simulate a dead DB."""
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(side_effect=Exception("DB unavailable"))
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


async def test_health_returns_503_when_db_error():
    """GET /health must return 503 when the database raises an exception."""
    with patch("backend.main.AsyncSessionLocal", return_value=_broken_db_cm()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            r = await ac.get("/health")
    assert r.status_code == 503


async def test_health_status_degraded_when_db_error():
    """GET /health body.status must be 'degraded' when the database is unreachable."""
    with patch("backend.main.AsyncSessionLocal", return_value=_broken_db_cm()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            r = await ac.get("/health")
    assert r.json()["status"] == "degraded"


async def test_health_db_error_field_when_db_error():
    """GET /health body.db must be 'error' when the database is unreachable."""
    with patch("backend.main.AsyncSessionLocal", return_value=_broken_db_cm()):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as ac:
            r = await ac.get("/health")
    assert r.json()["db"] == "error"

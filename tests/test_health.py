"""Tests for GET /health endpoint."""


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

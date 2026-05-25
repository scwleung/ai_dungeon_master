"""HTTP integration tests for TTS router endpoints."""
import pytest
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient


# ---------------------------------------------------------------------------
# GET /api/tts/providers tests
# ---------------------------------------------------------------------------


async def test_providers_no_keys_returns_browser(client, monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = await client.get("/api/tts/providers")
    assert r.status_code == 200
    assert "browser" in r.json()["providers"]


async def test_providers_with_elevenlabs_key_includes_elevenlabs(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "fake_key_123")
    r = await client.get("/api/tts/providers")
    assert r.status_code == 200
    assert "elevenlabs" in r.json()["providers"]


# ---------------------------------------------------------------------------
# POST /api/tts/synthesize tests
# ---------------------------------------------------------------------------


async def test_synthesize_browser_provider_returns_400(client, monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = await client.post(
        "/api/tts/synthesize",
        json={"text": "Hello world", "provider": "browser"},
    )
    assert r.status_code == 400


async def test_synthesize_empty_text_returns_422(client):
    r = await client.post(
        "/api/tts/synthesize",
        json={"text": "", "provider": "openai"},
    )
    assert r.status_code == 422


async def test_synthesize_whitespace_only_text_returns_422(client):
    r = await client.post(
        "/api/tts/synthesize",
        json={"text": "   ", "provider": "openai"},
    )
    assert r.status_code == 422


async def test_synthesize_elevenlabs_no_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    r = await client.post(
        "/api/tts/synthesize",
        json={"text": "Hello world", "provider": "elevenlabs"},
    )
    assert r.status_code == 503


async def test_synthesize_openai_no_key_returns_503(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    r = await client.post(
        "/api/tts/synthesize",
        json={"text": "Hello world", "provider": "openai"},
    )
    assert r.status_code == 503


async def test_synthesize_openai_with_mock_returns_200(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test_key")
    with patch(
        "backend.services.tts_service.OpenAITTS.synthesize",
        new_callable=AsyncMock,
        return_value=b"mp3",
    ):
        r = await client.post(
            "/api/tts/synthesize",
            json={"text": "Hello world", "provider": "openai"},
        )
    assert r.status_code == 200


async def test_synthesize_openai_with_mock_returns_audio_mpeg_content_type(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test_key")
    with patch(
        "backend.services.tts_service.OpenAITTS.synthesize",
        new_callable=AsyncMock,
        return_value=b"mp3",
    ):
        r = await client.post(
            "/api/tts/synthesize",
            json={"text": "Hello world", "provider": "openai"},
        )
    assert "audio/mpeg" in r.headers["content-type"]


async def test_synthesize_openai_with_mock_returns_correct_bytes(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test_key")
    with patch(
        "backend.services.tts_service.OpenAITTS.synthesize",
        new_callable=AsyncMock,
        return_value=b"mp3",
    ):
        r = await client.post(
            "/api/tts/synthesize",
            json={"text": "Hello world", "provider": "openai"},
        )
    assert r.content == b"mp3"


async def test_synthesize_provider_raises_exception_returns_502(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test_key")
    with patch(
        "backend.services.tts_service.OpenAITTS.synthesize",
        new_callable=AsyncMock,
        side_effect=Exception("Network failure"),
    ):
        r = await client.post(
            "/api/tts/synthesize",
            json={"text": "Hello world", "provider": "openai"},
        )
    assert r.status_code == 502

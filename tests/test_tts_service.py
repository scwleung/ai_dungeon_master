"""Tests for backend.services.tts_service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services.tts_service import (
    ElevenLabsTTS,
    OpenAITTS,
    TTSProvider,
    get_tts_provider,
    get_available_providers,
)


# ---------------------------------------------------------------------------
# ElevenLabsTTS tests
# ---------------------------------------------------------------------------


async def test_elevenlabs_synthesize_returns_bytes():
    provider = ElevenLabsTTS(api_key="test_key")

    mock_response = MagicMock()
    mock_response.content = b"mp3_bytes"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        result = await provider.synthesize("hello world")

    assert result == b"mp3_bytes"


async def test_elevenlabs_synthesize_uses_default_voice_id_in_url():
    provider = ElevenLabsTTS(api_key="test_key")
    default_voice = ElevenLabsTTS.DEFAULT_VOICE_ID

    mock_response = MagicMock()
    mock_response.content = b"mp3_bytes"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        await provider.synthesize("hello")

    call_args = instance.post.call_args
    called_url = call_args[0][0]
    assert default_voice in called_url


async def test_elevenlabs_synthesize_with_voice_id_override():
    provider = ElevenLabsTTS(api_key="test_key")
    custom_voice = "customVoiceXYZ"

    mock_response = MagicMock()
    mock_response.content = b"mp3_bytes"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        await provider.synthesize("hello", voice_id=custom_voice)

    call_args = instance.post.call_args
    called_url = call_args[0][0]
    assert custom_voice in called_url


def test_elevenlabs_default_voice_id_constant():
    assert ElevenLabsTTS.DEFAULT_VOICE_ID == "onwK4e9ZLuTAKqWW03F9"


# ---------------------------------------------------------------------------
# OpenAITTS tests
# ---------------------------------------------------------------------------


async def test_openai_synthesize_returns_bytes():
    provider = OpenAITTS(api_key="test_key")

    mock_response = MagicMock()
    mock_response.content = b"openai_mp3"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        result = await provider.synthesize("hello world")

    assert result == b"openai_mp3"


async def test_openai_synthesize_sends_correct_payload():
    provider = OpenAITTS(api_key="test_key")

    mock_response = MagicMock()
    mock_response.content = b"openai_mp3"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        await provider.synthesize("hello world")

    call_kwargs = instance.post.call_args[1]
    payload = call_kwargs["json"]
    assert payload["model"] == "tts-1"
    assert payload["input"] == "hello world"
    assert payload["voice"] == OpenAITTS.DEFAULT_VOICE
    assert payload["response_format"] == "mp3"


async def test_openai_synthesize_with_voice_id_override():
    provider = OpenAITTS(api_key="test_key")
    custom_voice = "nova"

    mock_response = MagicMock()
    mock_response.content = b"openai_mp3"
    mock_response.raise_for_status = MagicMock()

    with patch("backend.services.tts_service.httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.post = AsyncMock(return_value=mock_response)
        MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
        MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
        await provider.synthesize("hello", voice_id=custom_voice)

    call_kwargs = instance.post.call_args[1]
    payload = call_kwargs["json"]
    assert payload["voice"] == custom_voice


# ---------------------------------------------------------------------------
# get_tts_provider factory tests
# ---------------------------------------------------------------------------


def test_get_tts_provider_browser_returns_none():
    result = get_tts_provider("browser")
    assert result is None


def test_get_tts_provider_unknown_returns_none():
    result = get_tts_provider("unknown_provider_xyz")
    assert result is None


def test_get_tts_provider_elevenlabs_no_key_returns_none(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    result = get_tts_provider("elevenlabs")
    assert result is None


def test_get_tts_provider_elevenlabs_with_key_returns_instance(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "fake_key_123")
    result = get_tts_provider("elevenlabs")
    assert isinstance(result, ElevenLabsTTS)


def test_get_tts_provider_openai_no_key_returns_none(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    result = get_tts_provider("openai")
    assert result is None


def test_get_tts_provider_openai_with_key_returns_instance(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake_openai_key_456")
    result = get_tts_provider("openai")
    assert isinstance(result, OpenAITTS)


# ---------------------------------------------------------------------------
# get_available_providers tests
# ---------------------------------------------------------------------------


def test_get_available_providers_no_keys_returns_browser(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    providers = get_available_providers()
    assert providers == ["browser"]


def test_get_available_providers_with_elevenlabs_key(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("ELEVENLABS_API_KEY", "fake_key")
    providers = get_available_providers()
    assert "elevenlabs" in providers
    assert "browser" in providers


def test_get_available_providers_with_openai_key(monkeypatch):
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "fake_key")
    providers = get_available_providers()
    assert "openai" in providers
    assert "browser" in providers


def test_get_available_providers_with_both_keys_includes_all(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "fake_el_key")
    monkeypatch.setenv("OPENAI_API_KEY", "fake_oai_key")
    providers = get_available_providers()
    assert "browser" in providers
    assert "elevenlabs" in providers
    assert "openai" in providers


# ---------------------------------------------------------------------------
# TTSProvider Protocol tests
# ---------------------------------------------------------------------------


def test_elevenlabs_is_tts_provider_instance():
    provider = ElevenLabsTTS(api_key="test")
    assert isinstance(provider, TTSProvider)


def test_openai_is_tts_provider_instance():
    provider = OpenAITTS(api_key="test")
    assert isinstance(provider, TTSProvider)

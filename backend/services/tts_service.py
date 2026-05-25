"""
Text-to-Speech provider abstraction for the AI Dungeon Master application.

Supports ElevenLabs and OpenAI TTS providers, with a factory function
to select the appropriate provider based on configuration.
"""

from __future__ import annotations

import os
from typing import Optional, Protocol, runtime_checkable

import httpx


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------


@runtime_checkable
class TTSProvider(Protocol):
    """Common interface for all TTS providers."""

    async def synthesize(self, text: str, voice_id: Optional[str] = None) -> bytes:
        """
        Synthesize the given text to audio.

        Args:
            text: The text to convert to speech.
            voice_id: Optional voice identifier to override the default.

        Returns:
            Raw MP3 audio bytes.
        """
        ...


# ---------------------------------------------------------------------------
# ElevenLabs provider
# ---------------------------------------------------------------------------


class ElevenLabsTTS:
    """TTS provider backed by the ElevenLabs API."""

    BASE_URL = "https://api.elevenlabs.io/v1/text-to-speech"
    # "Daniel" — a deep, authoritative narrator voice
    DEFAULT_VOICE_ID = "onwK4e9ZLuTAKqWW03F9"

    def __init__(
        self,
        api_key: str,
        default_voice_id: str = DEFAULT_VOICE_ID,
    ) -> None:
        self.api_key = api_key
        self.default_voice_id = default_voice_id

    async def synthesize(self, text: str, voice_id: Optional[str] = None) -> bytes:
        """
        Synthesize text using ElevenLabs.

        Args:
            text: The text to convert to speech.
            voice_id: Optional voice ID override.

        Returns:
            MP3 audio bytes.

        Raises:
            httpx.HTTPStatusError: If the API returns a non-2xx status.
        """
        vid = voice_id or self.default_voice_id
        url = f"{self.BASE_URL}/{vid}"

        payload = {
            "text": text,
            "model_id": "eleven_monolingual_v1",
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }
        headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.content


# ---------------------------------------------------------------------------
# OpenAI TTS provider
# ---------------------------------------------------------------------------


class OpenAITTS:
    """TTS provider backed by the OpenAI Audio Speech API."""

    BASE_URL = "https://api.openai.com/v1/audio/speech"
    DEFAULT_VOICE = "onyx"

    def __init__(
        self,
        api_key: str,
        default_voice: str = DEFAULT_VOICE,
    ) -> None:
        self.api_key = api_key
        self.default_voice = default_voice

    async def synthesize(self, text: str, voice_id: Optional[str] = None) -> bytes:
        """
        Synthesize text using OpenAI TTS.

        Args:
            text: The text to convert to speech.
            voice_id: Optional voice name override (alloy, echo, fable, onyx, nova, shimmer).

        Returns:
            MP3 audio bytes.

        Raises:
            httpx.HTTPStatusError: If the API returns a non-2xx status.
        """
        voice = voice_id or self.default_voice

        payload = {
            "model": "tts-1",
            "input": text,
            "voice": voice,
            "response_format": "mp3",
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.BASE_URL, json=payload, headers=headers)
            response.raise_for_status()
            return response.content


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------


def get_tts_provider(provider: str) -> Optional[TTSProvider]:
    """
    Return a TTS provider instance based on the provider string.

    Args:
        provider: One of "elevenlabs", "openai", or "browser".

    Returns:
        A TTSProvider instance, or None if provider is "browser" or unknown.
    """
    if provider == "elevenlabs":
        api_key = os.getenv("ELEVENLABS_API_KEY", "")
        if not api_key:
            return None
        return ElevenLabsTTS(api_key=api_key)

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY", "")
        if not api_key:
            return None
        return OpenAITTS(api_key=api_key)

    # "browser" or anything else — no server-side synthesis
    return None


def get_available_providers() -> list[str]:
    """
    Return a list of TTS providers that have API keys configured.

    Always includes "browser" (Web Speech API, no key required).
    """
    providers = ["browser"]

    if os.getenv("ELEVENLABS_API_KEY"):
        providers.append("elevenlabs")

    if os.getenv("OPENAI_API_KEY"):
        providers.append("openai")

    return providers

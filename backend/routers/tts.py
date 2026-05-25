"""
Text-to-Speech REST endpoints for the AI Dungeon Master application.

Routes:
    POST /synthesize   Synthesize text to MP3 audio
    GET  /providers    List available TTS providers
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from backend.services.tts_service import get_available_providers, get_tts_provider

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class SynthesizeRequest(BaseModel):
    text: str
    provider: str
    voice_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/synthesize")
async def synthesize(payload: SynthesizeRequest):
    """
    Convert text to speech using the specified provider.

    Returns raw MP3 bytes with Content-Type: audio/mpeg.

    - provider: one of "elevenlabs", "openai", "browser"
    - voice_id: optional voice identifier (provider-specific)
    - For "browser", synthesis happens client-side; this endpoint
      returns a 400 error since there is no server-side audio to return.
    """
    if not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="text must not be empty",
        )

    if payload.provider == "browser":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Browser TTS is handled client-side. "
                "Use 'elevenlabs' or 'openai' for server-side synthesis."
            ),
        )

    provider = get_tts_provider(payload.provider)
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"TTS provider '{payload.provider}' is not available. "
                "Check that the required API key is configured."
            ),
        )

    try:
        audio_bytes = await provider.synthesize(
            text=payload.text,
            voice_id=payload.voice_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"TTS synthesis failed: {exc}",
        ) from exc

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=narration.mp3",
        },
    )


@router.get("/providers")
async def list_providers():
    """
    Return the list of TTS providers that are currently available.

    "browser" is always included (Web Speech API, no key required).
    "elevenlabs" and "openai" are included only when their API keys
    are present in the environment.
    """
    return {"providers": get_available_providers()}

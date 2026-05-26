"""OpenAI DALL-E 3 scene illustration service."""
from __future__ import annotations
import os
import httpx


async def generate_scene_image(description: str) -> str:
    """Call DALL-E 3 and return the image URL. Raises RuntimeError if unavailable."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not set; scene illustration unavailable")
    prompt = (
        f"Fantasy tabletop RPG atmospheric illustration: {description}. "
        "Epic digital art, detailed environment, dramatic lighting, painterly style."
    )
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.openai.com/v1/images/generations",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": "dall-e-3", "prompt": prompt, "n": 1, "size": "1024x1024", "quality": "standard"},
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["url"]

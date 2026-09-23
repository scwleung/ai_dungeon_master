"""Live-turn Jev shadow orchestration.

This module deliberately returns no gameplay decision. It launches the evaluator
beside Claude and records the comparison after Claude finishes.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from backend.services import jev_shadow
from backend.services.jev_telemetry import persist_shadow_evaluation

logger = logging.getLogger(__name__)


def start_shadow_evaluation(
    *,
    action_text: str,
    player_name: str,
    campaign: Any,
    characters: list[Any],
    history: list[dict[str, Any]],
    in_combat: bool,
) -> asyncio.Task | None:
    """Start Jev concurrently when configured; never block turn startup."""
    if not jev_shadow.enabled():
        return None
    return asyncio.create_task(
        jev_shadow.evaluate_action(
            action_text=action_text,
            player_name=player_name,
            campaign=campaign,
            characters=characters,
            history=history,
            in_combat=in_combat,
        )
    )


async def finish_shadow_evaluation(
    task: asyncio.Task | None,
    *,
    session_id: str,
    campaign_id: str,
    player_id: str | None,
    player_name: str | None,
    action_text: str,
    claude_response: str | None,
) -> None:
    """Resolve and persist shadow telemetry after Claude completes.

    Evaluation and persistence are both fail-open. The result is intentionally
    not returned to callers, preventing accidental use as gameplay authority.
    """
    if task is None:
        return
    try:
        evaluation = await task
    except Exception:
        logger.exception("Jev live shadow task failed")
        return
    await persist_shadow_evaluation(
        session_id=session_id,
        campaign_id=campaign_id,
        player_id=player_id,
        player_name=player_name,
        action_text=action_text,
        evaluation=evaluation,
        claude_response=claude_response,
    )

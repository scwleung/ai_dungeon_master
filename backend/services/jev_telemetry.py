"""Fail-open persistence helpers for Jev shadow telemetry."""
from __future__ import annotations

import json
import logging
from typing import Any

from backend.database import AsyncSessionLocal
from backend.models.jev_evaluation import JevShadowEvaluation

logger = logging.getLogger(__name__)


async def persist_shadow_evaluation(
    *,
    session_id: str,
    campaign_id: str,
    player_id: str | None,
    player_name: str | None,
    action_text: str,
    evaluation: Any,
    claude_response: str | None,
) -> None:
    """Store one completed comparison without ever affecting the live turn."""
    if evaluation is None:
        return

    try:
        payload = evaluation.to_dict() if hasattr(evaluation, "to_dict") else evaluation
        async with AsyncSessionLocal() as db:
            db.add(
                JevShadowEvaluation(
                    session_id=session_id,
                    campaign_id=campaign_id,
                    player_id=player_id,
                    player_name=player_name,
                    action_text=action_text,
                    evaluation_json=json.dumps(payload, sort_keys=True),
                    claude_response=claude_response,
                )
            )
            await db.commit()
    except Exception:
        # Telemetry must remain strictly outside the gameplay control path.
        logger.exception("Failed to persist Jev shadow evaluation")

"""Non-authoritative Jev evaluation for player actions.

Jev is deliberately outside the gameplay control path: Claude remains the DM,
and deterministic application code remains the only state authority. Missing
credentials or Jev failures return None and must never interrupt gameplay.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import asdict, dataclass
from typing import Any

logger = logging.getLogger(__name__)
SCHEMA_VERSION = "action-adjudication-v1"

CHECKS = {
    "athletics": "Strength (Athletics)", "acrobatics": "Dexterity (Acrobatics)",
    "sleight_of_hand": "Dexterity (Sleight of Hand)", "stealth": "Dexterity (Stealth)",
    "arcana": "Intelligence (Arcana)", "history": "Intelligence (History)",
    "investigation": "Intelligence (Investigation)", "nature": "Intelligence (Nature)",
    "religion": "Intelligence (Religion)", "animal_handling": "Wisdom (Animal Handling)",
    "insight": "Wisdom (Insight)", "medicine": "Wisdom (Medicine)",
    "perception": "Wisdom (Perception)", "survival": "Wisdom (Survival)",
    "deception": "Charisma (Deception)", "intimidation": "Charisma (Intimidation)",
    "performance": "Charisma (Performance)", "persuasion": "Charisma (Persuasion)",
    "other": "A roll is appropriate but none of the listed checks cleanly applies",
    "none": "No roll should be requested",
}

@dataclass(slots=True)
class ShadowEvaluation:
    schema_version: str
    model: str | None
    adjudication: str | None
    adjudication_probabilities: dict[str, float]
    adjudication_confidence: float | None
    check: str | None
    check_probabilities: dict[str, float]
    check_confidence: float | None
    difficulty: str | None
    difficulty_probabilities: dict[str, float]
    difficulty_confidence: float | None
    feasible_probability: float | None

    def to_dict(self) -> dict[str, Any]: return asdict(self)

def enabled() -> bool: return bool(os.getenv("TYPESAFE_API_KEY"))

def _json(value: Any, default: Any) -> Any:
    if not isinstance(value, str):
        return value if value is not None else default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default

def build_state(*, action_text: str, player_name: str, campaign: Any, characters: list[Any], history: list[dict[str, Any]], in_combat: bool) -> dict[str, Any]:
    chars = [{
        "name": getattr(c, "name", ""), "player_name": getattr(c, "player_name", ""),
        "class": getattr(c, "class_name", ""), "level": getattr(c, "level", None),
        "hp_current": getattr(c, "hp_current", None), "hp_max": getattr(c, "hp_max", None),
        "stats": _json(getattr(c, "stats", None), {}),
        "conditions": _json(getattr(c, "conditions", None), []),
    } for c in characters]
    recent = [{"role": m.get("role"), "player_name": m.get("player_name"), "text": str(m.get("text", ""))[:1200]} for m in history[-6:]]
    return {
        "ruleset": getattr(campaign, "ruleset", "freeform"),
        "campaign_description": str(getattr(campaign, "description", ""))[:1500],
        "world_state": _json(getattr(campaign, "world_state", None), {}),
        "in_combat": in_combat, "characters": chars, "recent_history": recent,
        "acting_player": player_name, "player_action": action_text,
    }

async def evaluate_action(**state_kwargs: Any) -> ShadowEvaluation | None:
    if not enabled():
        return None
    try:
        from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul
    except ImportError:
        logger.warning("TYPESAFE_API_KEY set but typesafe-sdk is unavailable")
        return None
    try:
        async with AsyncTypeSafeClient() as client:
            response = await asyncio.wait_for(client.system_one(
                state=build_state(**state_kwargs),
                questions={
                    "adjudication": Choice(instructions="How should the DM adjudicate this attempted action?", criteria={
                        "automatic_success": "It can simply succeed without a check.",
                        "roll_required": "Its uncertain outcome requires a game check or saving throw.",
                        "impossible": "It cannot succeed in the supplied state.",
                        "clarification_required": "Important information is missing or intent is too ambiguous.",
                    }),
                    "check": Choice(instructions="If a roll is required, choose the best check; otherwise choose none.", criteria=CHECKS),
                    "difficulty": Choice(instructions="Classify semantic difficulty; this is telemetry, not a numeric DC.", criteria={
                        "trivial": "Little meaningful chance of failure.", "easy": "A modest obstacle.",
                        "moderate": "A meaningful challenge.", "hard": "A difficult feat.",
                        "very_hard": "An exceptional feat near the edge of plausible success.",
                    }),
                    "feasible": Noul(instructions="Is the attempted action physically and narratively feasible in this game state?"),
                }), timeout=12.0)
    except Exception:
        logger.exception("Jev shadow evaluation failed")
        return None
    a, check, diff, feasible = response.choices["adjudication"], response.choices["check"], response.choices["difficulty"], response.nouls["feasible"]
    return ShadowEvaluation(SCHEMA_VERSION, getattr(response, "model", None), a.choice, dict(a.probabilities or {}), getattr(a, "confidence", None), check.choice, dict(check.probabilities or {}), getattr(check, "confidence", None), diff.choice, dict(diff.probabilities or {}), getattr(diff, "confidence", None), feasible.noul)

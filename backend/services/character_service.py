"""
Character service — database operations for character updates.

Extracted from backend/main.py to keep the WebSocket endpoint lean.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models.character import Character


async def update_character_in_db(character_id: str, tool_input: dict) -> str:
    """
    Apply an update_character tool call to the database.

    Returns a human-readable summary of changes made.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Character).where(Character.id == character_id)
        )
        char = result.scalar_one_or_none()
        if char is None:
            return f"Character {character_id!r} not found."

        changes: list[str] = []

        # HP delta
        hp_delta = tool_input.get("hp_delta")
        if hp_delta is not None:
            old_hp = char.hp_current
            char.hp_current = max(0, min(char.hp_max, char.hp_current + hp_delta))
            direction = "healed" if hp_delta > 0 else "took"
            changes.append(
                f"{char.name} {direction} {abs(hp_delta)} HP "
                f"({old_hp} → {char.hp_current}/{char.hp_max})"
            )

        # Inventory changes
        try:
            inventory: list[str] = json.loads(char.inventory)
        except (json.JSONDecodeError, TypeError):
            inventory = []

        for item in tool_input.get("add_items", []):
            if item not in inventory:
                inventory.append(item)
                changes.append(f"Added '{item}' to {char.name}'s inventory")

        for item in tool_input.get("remove_items", []):
            if item in inventory:
                inventory.remove(item)
                changes.append(f"Removed '{item}' from {char.name}'s inventory")

        char.inventory = json.dumps(inventory)

        # Condition changes
        try:
            conditions: list[str] = json.loads(char.conditions)
        except (json.JSONDecodeError, TypeError):
            conditions = []

        for cond in tool_input.get("add_conditions", []):
            if cond not in conditions:
                conditions.append(cond)
                changes.append(f"{char.name} gained condition: {cond}")

        for cond in tool_input.get("remove_conditions", []):
            if cond in conditions:
                conditions.remove(cond)
                changes.append(f"{char.name} lost condition: {cond}")

        char.conditions = json.dumps(conditions)

        # Notes
        notes_append = tool_input.get("notes_append")
        if notes_append:
            char.notes = (char.notes or "") + "\n" + notes_append
            changes.append(f"Added note for {char.name}")

        # Spell slots
        if "spell_slots" in tool_input:
            char.spell_slots = json.dumps(tool_input["spell_slots"])
            changes.append(f"Updated spell slots for {char.name}")

        # Class resources
        if "resources" in tool_input:
            char.resources = json.dumps(tool_input["resources"])
            changes.append(f"Updated resources for {char.name}")

        # XP
        if "xp" in tool_input:
            char.xp = tool_input["xp"]
            changes.append(f"Updated XP for {char.name}")

        # Death saves
        if "death_saves" in tool_input:
            char.death_saves = json.dumps(tool_input["death_saves"])
            changes.append(f"Updated death saves for {char.name}")

        # Concentration
        if "concentration" in tool_input:
            char.concentration = tool_input["concentration"]  # str or None
            if tool_input["concentration"]:
                changes.append(f"{char.name} is concentrating on {tool_input['concentration']}")
            else:
                changes.append(f"{char.name} broke concentration")

        # Inspiration
        if "inspiration" in tool_input:
            char.inspiration = 1 if tool_input["inspiration"] else 0
            status = "gained" if tool_input["inspiration"] else "spent"
            changes.append(f"{char.name} {status} inspiration")

        if "currency" in tool_input:
            char.currency = json.dumps(tool_input["currency"])
            changes.append(f"Updated currency for {char.name}")

        if "spellbook" in tool_input:
            char.spellbook = json.dumps(tool_input["spellbook"])
            changes.append(f"Updated spellbook for {char.name}")

        if "hit_dice_remaining" in tool_input:
            char.hit_dice_remaining = tool_input["hit_dice_remaining"]
            changes.append(f"Updated hit dice for {char.name}")

        if "exhaustion" in tool_input:
            old = int(char.exhaustion or 0)
            char.exhaustion = max(0, min(6, int(tool_input["exhaustion"])))
            if char.exhaustion > old:
                changes.append(f"{char.name} exhaustion increased to level {char.exhaustion}")
            elif char.exhaustion < old:
                changes.append(f"{char.name} exhaustion reduced to level {char.exhaustion}")

        def _safe_json(raw, default):
            if isinstance(raw, str):
                try:
                    return json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    return default
            return raw if raw is not None else default

        if "bonds" in tool_input:
            char.bonds = tool_input["bonds"]
        if "ideals" in tool_input:
            char.ideals = tool_input["ideals"]
        if "flaws" in tool_input:
            char.flaws = tool_input["flaws"]
        if "personality" in tool_input:
            char.personality = tool_input["personality"]
        if "languages" in tool_input:
            char.languages = json.dumps(tool_input["languages"])
        if "tool_proficiencies" in tool_input:
            char.tool_proficiencies = json.dumps(tool_input["tool_proficiencies"])
        if "features" in tool_input:
            char.features = json.dumps(tool_input["features"])
        if "feature_use" in tool_input:
            feature_id = tool_input["feature_use"].get("feature_id")
            delta = int(tool_input["feature_use"].get("delta", -1))
            feats = _safe_json(char.features, [])
            found = False
            for f in feats:
                if f.get("id") == feature_id:
                    new_uses = max(0, f.get("uses_remaining", 0) + delta)
                    f["uses_remaining"] = new_uses
                    found = True
            if not found:
                import logging
                logging.getLogger(__name__).warning(
                    "feature_use: feature_id %r not found on character %s", feature_id, character_id
                )
            char.features = json.dumps(feats)

        # Append audit log entry
        if changes:
            try:
                audit = json.loads(char.audit_log or "[]")
            except (json.JSONDecodeError, TypeError):
                audit = []
            audit.append({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "change": "; ".join(changes),
            })
            char.audit_log = json.dumps(audit[-200:])  # cap at 200 entries

        await db.commit()

        return "; ".join(changes) if changes else f"No changes made to {char.name}."

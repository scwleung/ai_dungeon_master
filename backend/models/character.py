"""
Character ORM model and Pydantic schemas.

ORM model:
    Character — a player character belonging to a campaign.

Pydantic schemas:
    CharacterCreate   — input schema for creating a character.
    CharacterResponse — output schema returned by the characters API.
    CharacterUpdate   — partial-update schema (PATCH semantics; all fields optional).

JSON storage note: ``stats`` (dict), ``inventory`` (list[str]), ``conditions``,
``spell_slots``, ``currency``, ``spellbook``, ``languages``,
``tool_proficiencies``, ``features``, and ``audit_log`` are stored as JSON
strings in SQLite / PostgreSQL.  The ``parse_json_fields`` validator deserialises
them when building response objects, and write endpoints re-serialise them on
save.

``conditions`` may contain either plain strings (e.g. ``"Poisoned"``) or
objects of the form ``{"name": str, "duration": str}`` when a duration is
relevant to the condition.

New columns added after initial schema creation (applied via ALTER TABLE in
``backend/main.py`` lifespan):
    bonds, ideals, flaws, personality  — character backstory text fields.
    languages          — JSON list of known languages.
    tool_proficiencies — JSON list of tool proficiency strings.
    features           — JSON list of class feature objects:
                         ``[{id, name, description, uses_remaining, uses_max, recharge}]``.
                         The ``feature_use`` field in ``CharacterUpdate`` accepts
                         ``{feature_id, delta}`` to atomically adjust ``uses_remaining``.
    hit_dice_remaining — Integer; decremented when a hit die is spent during a short rest.
    exhaustion         — Integer 0–6 (0 = none, 6 = death).
    currency           — JSON dict: ``{"gp": int, "sp": int, "cp": int, "ep": int, "pp": int}``.
    spellbook          — JSON list of spell objects: ``[{name, level, prepared}]``.
    audit_log          — JSON list of timestamped change records (read-only via GET endpoint);
                         capped at 200 entries.
    death_saves        — JSON dict: ``{"successes": int, "failures": int}``.
    concentration      — String name of the spell being concentrated on, or ``null``.
    inspiration        — Integer (0 or 1); surfaced as boolean in ``CharacterResponse``.
    xp                 — Integer; total accumulated experience points.
    spell_slots        — JSON dict keyed by slot level (``"1"``–``"9"``), values
                         ``{"max": int, "used": int}``.
    resources          — JSON dict of class resource objects keyed by snake_case name,
                         values ``{"label": str, "max": int, "used": int}``.
"""

import json
import uuid
from typing import Any, Dict, Optional

from sqlalchemy import String, Text, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# SQLAlchemy ORM Model
# ---------------------------------------------------------------------------


class Character(Base):
    """SQLAlchemy ORM model representing a player character.

    Attributes:
        id: UUID primary key.
        campaign_id: Foreign key to the owning ``Campaign``; cascades on delete.
        player_name: Real-world name of the player controlling this character.
        name: In-world character name.
        race: Character race (e.g. ``"Human"``, ``"Elf"``).
        class_name: Character class (e.g. ``"Fighter"``, ``"Wizard"``).
            Stored as ``class_name`` to avoid shadowing Python's ``class``
            keyword.
        level: Current character level (1–20 for D&D 5e / PF2e).
        hp_current: Hit points remaining.
        hp_max: Maximum hit points.
        stats: JSON-serialised ability-score dict
            ``{"STR": int, "DEX": int, "CON": int, "INT": int, "WIS": int, "CHA": int}``.
        inventory: JSON-serialised list of item name strings.
        conditions: JSON-serialised list of active condition strings or objects.
            Simple form: ``["Poisoned", "Prone"]``.
            Extended form: ``[{"name": "Poisoned", "duration": "1 minute"}, ...]``.
        notes: Free-text field for backstory, session notes, etc.
        spell_slots: JSON dict keyed by slot level (``"1"``–``"9"``),
            values ``{"max": int, "used": int}``.  ``None`` for non-spellcasters.
        resources: JSON dict of class resource objects keyed by snake_case name,
            values ``{"label": str, "max": int, "used": int}``.  ``None`` if unused.
        xp: Total accumulated experience points.
        death_saves: JSON dict ``{"successes": int, "failures": int}``.
        concentration: String name of the spell being concentrated on, or ``None``.
        inspiration: Integer (0 or 1); surfaced as boolean in ``CharacterResponse``.
        currency: JSON dict ``{"gp": int, "sp": int, "cp": int, "ep": int, "pp": int}``.
        spellbook: JSON list of spell objects ``[{"name": str, "level": int, "prepared": bool}]``.
        audit_log: JSON list of change records
            ``[{"timestamp": str, "change": str}]``; capped at 200 entries; read-only.
        hit_dice_remaining: Number of hit dice remaining for short rests.
        exhaustion: Exhaustion level 0–6 (0 = none, 6 = death).
        bonds: Character bonds free-text.
        ideals: Character ideals free-text.
        flaws: Character flaws free-text.
        personality: Character personality traits free-text.
        languages: JSON list of known languages (e.g. ``["Common", "Elvish"]``).
        tool_proficiencies: JSON list of tool proficiency strings.
        features: JSON list of class feature objects
            ``[{id, name, description, uses_remaining, uses_max, recharge}]``.
            The ``feature_use`` payload ``{feature_id, delta}`` atomically adjusts
            ``uses_remaining``.
        campaign: Back-reference to the parent ``Campaign`` object.
    """

    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    player_name: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    race: Mapped[str] = mapped_column(String(100), nullable=False, default="Human")
    class_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Fighter")
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    hp_current: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    hp_max: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    stats: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default='{"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}',
    )
    inventory: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    conditions: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    notes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    spell_slots: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    resources: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    xp: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    death_saves: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    concentration: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    inspiration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    currency: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    spellbook: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    audit_log: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    hit_dice_remaining: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=None)
    exhaustion: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    bonds: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ideals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    flaws: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    personality: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    languages: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default='[]')
    tool_proficiencies: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default='[]')
    features: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default='[]')

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="characters")  # type: ignore[name-defined]


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class CharacterCreate(BaseModel):
    """Request body for creating a new character.

    All fields except ``player_name`` and ``name`` have sensible defaults so
    that a minimal payload can create a valid character.
    """

    player_name: str
    name: str
    race: str = "Human"
    class_name: str = "Fighter"
    level: int = 1
    hp_current: int = 10
    hp_max: int = 10
    stats: dict = {
        "STR": 10,
        "DEX": 10,
        "CON": 10,
        "INT": 10,
        "WIS": 10,
        "CHA": 10,
    }
    inventory: list[str] = []
    conditions: list[str] = []
    notes: str = ""


class CharacterResponse(BaseModel):
    """API response schema for a character.

    JSON-serialised ORM fields (``stats``, ``inventory``, ``conditions``) are
    always returned as their native Python types via ``parse_json_fields``.
    """

    id: str
    campaign_id: str
    player_name: str
    name: str
    race: str
    class_name: str
    level: int
    hp_current: int
    hp_max: int
    stats: dict
    inventory: list[str]
    conditions: list[str]
    notes: str
    spell_slots: Optional[Dict[str, Any]] = None
    resources: Optional[Dict[str, Any]] = None
    xp: Optional[int] = None
    death_saves: Optional[Dict[str, int]] = None
    concentration: Optional[str] = None
    inspiration: bool = False
    currency: Optional[Dict[str, int]] = None   # {"gp": 0, "sp": 0, "cp": 0, "ep": 0, "pp": 0}
    spellbook: Optional[list] = None            # list of {"name": str, "level": int, "prepared": bool}
    audit_log: Optional[list] = None            # read-only, list of {"timestamp": str, "change": str}
    hit_dice_remaining: Optional[int] = None
    exhaustion: int = 0
    bonds: Optional[str] = None
    ideals: Optional[str] = None
    flaws: Optional[str] = None
    personality: Optional[str] = None
    languages: Optional[list] = None
    tool_proficiencies: Optional[list] = None
    features: Optional[list] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_json_fields(cls, values):
        """Deserialise JSON string fields from an ORM object or dict."""
        if hasattr(values, "__dict__"):
            obj = values

            def safe_json(raw, default):
                if isinstance(raw, str):
                    try:
                        return json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        return default
                return raw if raw is not None else default

            return {
                "id": obj.id,
                "campaign_id": obj.campaign_id,
                "player_name": obj.player_name,
                "name": obj.name,
                "race": obj.race,
                "class_name": obj.class_name,
                "level": obj.level,
                "hp_current": obj.hp_current,
                "hp_max": obj.hp_max,
                "stats": safe_json(obj.stats, {}),
                "inventory": safe_json(obj.inventory, []),
                "conditions": safe_json(obj.conditions, []),
                "notes": obj.notes,
                "spell_slots": safe_json(getattr(obj, "spell_slots", None), None),
                "resources": safe_json(getattr(obj, "resources", None), None),
                "xp": getattr(obj, "xp", None),
                "death_saves": safe_json(getattr(obj, "death_saves", None), None),
                "concentration": getattr(obj, "concentration", None),
                "inspiration": bool(getattr(obj, "inspiration", 0) or 0),
                "currency": safe_json(getattr(obj, "currency", None), None),
                "spellbook": safe_json(getattr(obj, "spellbook", None), None),
                "audit_log": safe_json(getattr(obj, "audit_log", None), None),
                "hit_dice_remaining": getattr(obj, "hit_dice_remaining", None),
                "exhaustion": int(getattr(obj, "exhaustion", 0) or 0),
                "bonds": getattr(obj, "bonds", None),
                "ideals": getattr(obj, "ideals", None),
                "flaws": getattr(obj, "flaws", None),
                "personality": getattr(obj, "personality", None),
                "languages": safe_json(getattr(obj, "languages", None), []),
                "tool_proficiencies": safe_json(getattr(obj, "tool_proficiencies", None), []),
                "features": safe_json(getattr(obj, "features", None), []),
            }
        if isinstance(values, dict):

            def safe_json(raw, default):
                if isinstance(raw, str):
                    try:
                        return json.loads(raw)
                    except (json.JSONDecodeError, TypeError):
                        return default
                return raw if raw is not None else default

            for field, default in [("stats", {}), ("inventory", []), ("conditions", [])]:
                values[field] = safe_json(values.get(field), default)
            for field in ("spell_slots", "resources", "death_saves"):
                if field in values:
                    values[field] = safe_json(values.get(field), None)
        return values


class CharacterUpdate(BaseModel):
    """Partial-update body for a character (PATCH semantics).

    All fields are optional; only fields explicitly included in the request
    payload are applied to the stored character.
    """

    player_name: Optional[str] = None
    name: Optional[str] = None
    race: Optional[str] = None
    class_name: Optional[str] = None
    level: Optional[int] = None
    hp_current: Optional[int] = None
    hp_max: Optional[int] = None
    stats: Optional[dict] = None
    inventory: Optional[list[str]] = None
    conditions: Optional[list[str]] = None
    notes: Optional[str] = None
    spell_slots: Optional[Dict[str, Any]] = None
    resources: Optional[Dict[str, Any]] = None
    xp: Optional[int] = None
    death_saves: Optional[Dict[str, int]] = None
    concentration: Optional[str] = None
    inspiration: Optional[bool] = None
    currency: Optional[Dict[str, int]] = None
    spellbook: Optional[list] = None
    hit_dice_remaining: Optional[int] = None
    exhaustion: Optional[int] = None
    bonds: Optional[str] = None
    ideals: Optional[str] = None
    flaws: Optional[str] = None
    personality: Optional[str] = None
    languages: Optional[list] = None
    tool_proficiencies: Optional[list] = None
    features: Optional[list] = None
    feature_use: Optional[dict] = None  # {"feature_id": str, "delta": int}

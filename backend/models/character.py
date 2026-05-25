"""
Character ORM model and Pydantic schemas.

ORM model:
    Character — a player character belonging to a campaign.

Pydantic schemas:
    CharacterCreate   — input schema for creating a character.
    CharacterResponse — output schema returned by the characters API.
    CharacterUpdate   — partial-update schema (PATCH semantics; all fields optional).

JSON storage note: ``stats`` (dict), ``inventory`` (list[str]), and
``conditions`` (list[str]) are stored as JSON strings in SQLite.  The
``parse_json_fields`` validator deserialises them when building response objects,
and the ``update_character`` endpoint re-serialises them on write.
"""

import json
import uuid
from typing import Optional

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
        conditions: JSON-serialised list of active condition strings
            (e.g. ``["Poisoned", "Prone"]``).
        notes: Free-text field for backstory, session notes, etc.
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

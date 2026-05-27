"""
Campaign and Session ORM models and Pydantic schemas.

ORM models:
    Campaign  — top-level container for a role-playing campaign.
    Session   — a single play session within a campaign; stores the full
                message history as a JSON-serialised list.

Pydantic schemas:
    CampaignCreate    — input schema for creating a campaign.
    CampaignResponse  — output schema returned by the campaigns API.
    NarrativeMessage  — a single message in a session's chat history.
    SessionResponse   — output schema returned by the sessions API.

JSON storage note: ``world_state`` (Campaign) and ``messages`` (Session) are
persisted as JSON strings in SQLite because aiosqlite does not natively support
JSON columns.  The Pydantic ``model_validator`` methods handle deserialisation
when constructing response objects.
"""

import json
import secrets
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from pydantic import BaseModel, model_validator


def generate_access_code() -> str:
    """Generate a random 8-character URL-safe access code for a campaign."""
    return secrets.token_urlsafe(6)


# ---------------------------------------------------------------------------
# SQLAlchemy ORM Models
# ---------------------------------------------------------------------------


class Campaign(Base):
    """SQLAlchemy ORM model representing a role-playing campaign.

    Attributes:
        id: UUID primary key generated at creation time.
        name: Human-readable campaign title.
        ruleset: Game system identifier (``dnd5e``, ``pathfinder2e``, or
            ``freeform``).
        description: Optional flavour text / premise for the campaign.
        created_at: Server-side UTC timestamp set on INSERT.
        world_state: JSON-serialised dict tracking persistent world facts
            (NPC attitudes, quest state, current location, etc.).
        access_code: Random URL-safe token used to gate write access to
            this campaign via the ``X-Access-Code`` request header.
        characters: One-to-many relationship to ``Character`` rows.
        sessions: One-to-many relationship to ``Session`` rows.
    """

    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ruleset: Mapped[str] = mapped_column(String(50), nullable=False, default="dnd5e")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    world_state: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    access_code: Mapped[str] = mapped_column(String(12), nullable=False, default=generate_access_code)
    map_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    npcs: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    quests: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    party_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    map_annotations: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    world_time: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    handouts: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    timeline: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    readalouds: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)

    characters: Mapped[list["Character"]] = relationship(  # type: ignore[name-defined]
        "Character",
        back_populates="campaign",
        cascade="all, delete-orphan",
        lazy="select",
    )
    sessions: Mapped[list["Session"]] = relationship(
        "Session",
        back_populates="campaign",
        cascade="all, delete-orphan",
        lazy="select",
    )


class Session(Base):
    """SQLAlchemy ORM model representing a single play session.

    Attributes:
        id: UUID primary key.
        campaign_id: Foreign key to the parent ``Campaign``; cascades on delete.
        started_at: UTC timestamp when the session was created.
        ended_at: UTC timestamp when ``end_session`` was called; ``None`` while
            the session is still active.
        messages: JSON-serialised list of ``NarrativeMessage`` dicts that form
            the session's chat history (only the most recent window after
            summarisation).
        session_summary: Condensed narrative of messages that have been rolled
            out of the active window; ``None`` for sessions that have not yet
            been summarised.
        campaign: Back-reference to the parent ``Campaign`` object.
    """

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    messages: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    session_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    pinned_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)
    dm_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default=None)

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="sessions")


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class CampaignCreate(BaseModel):
    """Request body for creating a new campaign."""

    name: str
    ruleset: str = "dnd5e"
    description: str = ""


class CampaignResponse(BaseModel):
    """API response schema for a campaign.

    ``world_state`` is always returned as a parsed ``dict``; ``session_count``
    is derived from the length of the ``sessions`` relationship at read time.
    ``access_code`` is included so clients can store it for subsequent
    authenticated requests.
    """

    id: str
    name: str
    ruleset: str
    description: str
    created_at: datetime
    world_state: dict
    access_code: str
    session_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_world_state(cls, values):
        """Deserialise ``world_state`` and compute ``session_count`` from an ORM object or dict."""
        # Handle SQLAlchemy ORM object
        if hasattr(values, "__dict__"):
            obj = values
            world_state = obj.world_state
            if isinstance(world_state, str):
                try:
                    world_state = json.loads(world_state)
                except (json.JSONDecodeError, TypeError):
                    world_state = {}
            sessions = getattr(obj, "sessions", []) or []
            return {
                "id": obj.id,
                "name": obj.name,
                "ruleset": obj.ruleset,
                "description": obj.description,
                "created_at": obj.created_at,
                "world_state": world_state,
                "access_code": obj.access_code,
                "session_count": len(sessions),
            }
        # Handle dict
        if isinstance(values, dict):
            ws = values.get("world_state", "{}")
            if isinstance(ws, str):
                try:
                    values["world_state"] = json.loads(ws)
                except (json.JSONDecodeError, TypeError):
                    values["world_state"] = {}
        return values


class NarrativeMessage(BaseModel):
    """A single message in a session's chat history.

    Attributes:
        id: Client-generated or server-generated identifier for the message.
        role: Speaker role — ``"user"``, ``"assistant"``, or ``"system"``.
        player_name: Display name of the human player, present when
            ``role == "user"`` and ``None`` for assistant/system messages.
        text: The narrative or player text content.
        timestamp: ISO 8601 timestamp string recorded when the message was
            added to the session.
    """

    id: str
    role: str  # "user" | "assistant" | "system"
    player_name: Optional[str] = None
    text: str
    timestamp: str


class SessionResponse(BaseModel):
    """API response schema for a play session.

    ``messages`` is always returned as a parsed list of ``NarrativeMessage``
    objects regardless of whether the underlying ORM field is a JSON string
    or an already-decoded list.  ``session_summary`` holds the condensed
    narrative of messages that have been rolled out of the active window.
    """

    id: str
    campaign_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    messages: list[NarrativeMessage] = []
    session_summary: Optional[str] = None
    notes: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_messages(cls, values):
        """Deserialise the JSON ``messages`` field from an ORM object or dict."""
        if hasattr(values, "__dict__"):
            obj = values
            raw = obj.messages
            if isinstance(raw, str):
                try:
                    parsed = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    parsed = []
            else:
                parsed = raw or []
            return {
                "id": obj.id,
                "campaign_id": obj.campaign_id,
                "started_at": obj.started_at,
                "ended_at": obj.ended_at,
                "messages": parsed,
                "session_summary": getattr(obj, "session_summary", None),
                "notes": getattr(obj, "notes", None),
            }
        if isinstance(values, dict):
            raw = values.get("messages", "[]")
            if isinstance(raw, str):
                try:
                    values["messages"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    values["messages"] = []
        return values

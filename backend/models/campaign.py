import json
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base
from pydantic import BaseModel, model_validator


# ---------------------------------------------------------------------------
# SQLAlchemy ORM Models
# ---------------------------------------------------------------------------


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ruleset: Mapped[str] = mapped_column(String(50), nullable=False, default="dnd5e")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    world_state: Mapped[str] = mapped_column(Text, nullable=False, default="{}")

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
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign_id: Mapped[str] = mapped_column(String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    messages: Mapped[str] = mapped_column(Text, nullable=False, default="[]")

    campaign: Mapped["Campaign"] = relationship("Campaign", back_populates="sessions")


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------


class CampaignCreate(BaseModel):
    name: str
    ruleset: str = "dnd5e"
    description: str = ""


class CampaignResponse(BaseModel):
    id: str
    name: str
    ruleset: str
    description: str
    created_at: datetime
    world_state: dict
    session_count: int = 0

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_world_state(cls, values):
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
    id: str
    role: str  # "user" | "assistant" | "system"
    player_name: Optional[str] = None
    text: str
    timestamp: str


class SessionResponse(BaseModel):
    id: str
    campaign_id: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    messages: list[NarrativeMessage] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def parse_messages(cls, values):
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
            }
        if isinstance(values, dict):
            raw = values.get("messages", "[]")
            if isinstance(raw, str):
                try:
                    values["messages"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    values["messages"] = []
        return values

"""Persistence model for non-authoritative Jev shadow evaluations."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class JevShadowEvaluation(Base):
    """Telemetry captured beside a live turn; never used as gameplay state."""

    __tablename__ = "jev_shadow_evaluations"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    player_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action_text: Mapped[str] = mapped_column(Text, nullable=False)
    evaluation_json: Mapped[str] = mapped_column(Text, nullable=False)
    claude_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_jev_shadow_session_created", "session_id", "created_at"),
        Index("ix_jev_shadow_campaign_created", "campaign_id", "created_at"),
    )

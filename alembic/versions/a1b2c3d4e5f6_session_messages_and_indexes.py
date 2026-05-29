"""Add session_messages table and campaign/character FK indexes

Revision ID: a1b2c3d4e5f6
Revises: 8eb3ecc4b704
Create Date: 2026-05-29 00:00:00.000000

"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "8eb3ecc4b704"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- new session_messages table ---
    op.create_table(
        "session_messages",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("session_id", sa.String(36), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("player_name", sa.String(255), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("timestamp", sa.String(50), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_session_message_session_id", "session_messages", ["session_id"])
    op.create_index("ix_session_message_session_seq", "session_messages", ["session_id", "seq"])

    # --- indexes on existing FK columns ---
    # Use try/except because these may already exist on databases created via init_db().
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    existing_session_indexes = {i["name"] for i in inspector.get_indexes("sessions")}
    if "ix_session_campaign_id" not in existing_session_indexes:
        op.create_index("ix_session_campaign_id", "sessions", ["campaign_id"])

    existing_char_indexes = {i["name"] for i in inspector.get_indexes("characters")}
    if "ix_character_campaign_id" not in existing_char_indexes:
        op.create_index("ix_character_campaign_id", "characters", ["campaign_id"])

    # --- migrate existing JSON-blob messages into session_messages rows ---
    sessions_result = bind.execute(
        sa.text("SELECT id, messages FROM sessions WHERE messages IS NOT NULL AND messages != '[]'")
    )
    for session_id, messages_json in sessions_result:
        try:
            messages = json.loads(messages_json or "[]")
        except (json.JSONDecodeError, TypeError):
            continue
        for seq, msg in enumerate(messages):
            if not isinstance(msg, dict):
                continue
            bind.execute(
                sa.text(
                    "INSERT INTO session_messages (id, session_id, role, player_name, text, timestamp, seq) "
                    "VALUES (:id, :sid, :role, :pname, :text, :ts, :seq)"
                ),
                {
                    "id": msg.get("id") or str(uuid.uuid4()),
                    "sid": session_id,
                    "role": msg.get("role", "user"),
                    "pname": msg.get("player_name"),
                    "text": msg.get("text", ""),
                    "ts": msg.get("timestamp", datetime.now(timezone.utc).isoformat()),
                    "seq": seq,
                },
            )


def downgrade() -> None:
    op.drop_index("ix_session_message_session_seq", table_name="session_messages")
    op.drop_index("ix_session_message_session_id", table_name="session_messages")
    op.drop_table("session_messages")
    # Note: campaign/character indexes are not dropped on downgrade to avoid
    # unintentionally degrading performance on rollback.

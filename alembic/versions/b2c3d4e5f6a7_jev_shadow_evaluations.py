"""add Jev shadow evaluation telemetry

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "jev_shadow_evaluations",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=False),
        sa.Column("campaign_id", sa.String(length=36), nullable=False),
        sa.Column("player_id", sa.String(length=255), nullable=True),
        sa.Column("player_name", sa.String(length=255), nullable=True),
        sa.Column("action_text", sa.Text(), nullable=False),
        sa.Column("evaluation_json", sa.Text(), nullable=False),
        sa.Column("claude_response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_jev_shadow_session_created", "jev_shadow_evaluations", ["session_id", "created_at"])
    op.create_index("ix_jev_shadow_campaign_created", "jev_shadow_evaluations", ["campaign_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_jev_shadow_campaign_created", table_name="jev_shadow_evaluations")
    op.drop_index("ix_jev_shadow_session_created", table_name="jev_shadow_evaluations")
    op.drop_table("jev_shadow_evaluations")

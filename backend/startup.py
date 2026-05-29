"""
Database startup migrations.

Runs ALTER TABLE statements idempotently on every application start.
Each statement executes in its own transaction so a "column already exists"
failure only skips that one column and leaves all others unaffected.
"""

from __future__ import annotations

from sqlalchemy import text

MIGRATION_STATEMENTS = [
    "ALTER TABLE characters ADD COLUMN spell_slots TEXT",
    "ALTER TABLE characters ADD COLUMN resources TEXT",
    "ALTER TABLE sessions ADD COLUMN notes TEXT",
    "ALTER TABLE campaigns ADD COLUMN party_state TEXT",
    "ALTER TABLE sessions ADD COLUMN pinned_notes TEXT",
    "ALTER TABLE characters ADD COLUMN xp INTEGER",
    "ALTER TABLE characters ADD COLUMN death_saves TEXT",
    "ALTER TABLE characters ADD COLUMN concentration TEXT",
    "ALTER TABLE characters ADD COLUMN inspiration INTEGER DEFAULT 0",
    "ALTER TABLE campaigns ADD COLUMN map_annotations TEXT",
    "ALTER TABLE campaigns ADD COLUMN world_time TEXT",
    "ALTER TABLE campaigns ADD COLUMN handouts TEXT",
    "ALTER TABLE campaigns ADD COLUMN timeline TEXT",
    "ALTER TABLE characters ADD COLUMN currency TEXT",
    "ALTER TABLE characters ADD COLUMN spellbook TEXT",
    "ALTER TABLE characters ADD COLUMN audit_log TEXT",
    "ALTER TABLE sessions ADD COLUMN dm_notes TEXT",
    "ALTER TABLE campaigns ADD COLUMN readalouds TEXT",
    "ALTER TABLE characters ADD COLUMN hit_dice_remaining INTEGER",
    "ALTER TABLE characters ADD COLUMN exhaustion INTEGER DEFAULT 0",
    "ALTER TABLE characters ADD COLUMN bonds TEXT",
    "ALTER TABLE characters ADD COLUMN ideals TEXT",
    "ALTER TABLE characters ADD COLUMN flaws TEXT",
    "ALTER TABLE characters ADD COLUMN personality TEXT",
    "ALTER TABLE characters ADD COLUMN languages TEXT DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN tool_proficiencies TEXT DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN features TEXT DEFAULT '[]'",
    "ALTER TABLE campaigns ADD COLUMN random_tables TEXT DEFAULT '[]'",
    "ALTER TABLE characters ADD COLUMN alignment VARCHAR(50)",
    "ALTER TABLE characters ADD COLUMN background VARCHAR(100)",
]


async def run_migrations(engine) -> None:
    """Run each ALTER TABLE in its own transaction.

    A failure (e.g. column already exists) only rolls back that single
    statement; all other columns are added normally.

    Args:
        engine: The SQLAlchemy async engine (not a connection).
    """
    for stmt in MIGRATION_STATEMENTS:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception:
            pass  # column already exists — skip silently

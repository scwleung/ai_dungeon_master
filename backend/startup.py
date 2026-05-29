"""
Database startup migrations.

Contains the ALTER TABLE statements run on every application start to
idempotently add new columns to the database schema.  Each statement is
wrapped in its own try/except so that columns that already exist are silently
skipped.

Alembic is also configured for schema migrations (`alembic upgrade head`). The
ALTER TABLE statements here serve as a fallback for existing databases.
"""

from __future__ import annotations

from sqlalchemy import text


async def run_migrations(conn) -> None:
    """Execute all pending schema-migration ALTER TABLE statements.

    Args:
        conn: An active SQLAlchemy ``AsyncConnection`` obtained via
              ``async with engine.begin() as conn``.  All statements are
              attempted in a single transaction; per-statement rollbacks
              silently skip columns that already exist, and a single final
              commit is issued after all statements have been attempted.
    """
    migration_statements = [
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
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS bonds TEXT",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS ideals TEXT",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS flaws TEXT",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS personality TEXT",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS languages TEXT DEFAULT '[]'",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS tool_proficiencies TEXT DEFAULT '[]'",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS features TEXT DEFAULT '[]'",
        "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS random_tables TEXT DEFAULT '[]'",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS alignment VARCHAR(50)",
        "ALTER TABLE characters ADD COLUMN IF NOT EXISTS background VARCHAR(100)",
    ]

    for col_sql in migration_statements:
        try:
            await conn.execute(text(col_sql))
        except Exception:
            await conn.rollback()  # roll back the failed statement only
    await conn.commit()  # single commit after all statements attempted

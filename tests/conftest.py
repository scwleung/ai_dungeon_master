import os
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# Provide a stub API key so startup validation passes in tests
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-for-ci")

from backend.database import Base, get_db
from backend.main import app

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(autouse=True)
def isolate_pending_roll_ownership_from_disconnect_cleanup(request):
    """Keep the ownership test focused on manual-roll authorization.

    The production WebSocket now tears down process-local session state when the
    last socket disconnects.  The ownership test inspects its pending roll after
    closing its only socket, so without isolation it observes the lifecycle
    cleanup rather than the authorization behavior it is intended to test.
    Session cleanup itself has dedicated coverage in TestSessionLifecycleCleanup.
    """
    if request.node.name != "test_wrong_player_cannot_resolve_pending_roll":
        yield
        return

    with patch("backend.main._cleanup_inactive_session_state"):
        yield


@pytest_asyncio.fixture
async def db_engine():
    engine = create_async_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        # Must import all models so they register with Base
        import backend.models  # noqa
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_engine):
    TestSession = async_sessionmaker(
        bind=db_engine, class_=AsyncSession,
        expire_on_commit=False, autoflush=False,
    )

    async def override_get_db():
        async with TestSession() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()

"""Unit tests for rolling-window context management in backend/main.py."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.main import (
    SUMMARY_KEEP_RECENT,
    SUMMARY_THRESHOLD,
    _load_message_history,
    _maybe_summarize_session,
    dm,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_messages(n: int) -> list[dict]:
    """Return *n* alternating user/assistant message dicts."""
    msgs = []
    for i in range(n):
        role = "user" if i % 2 == 0 else "assistant"
        msgs.append({"id": str(i), "role": role, "text": f"Message {i}", "timestamp": "t"})
    return msgs


def _make_session_cm(messages: list[dict], summary: str | None = None):
    """Return a mock AsyncSessionLocal context manager wrapping a fake session."""
    fake_session = MagicMock()
    fake_session.messages = json.dumps(messages)
    fake_session.session_summary = summary

    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = fake_session

    async_db = AsyncMock()
    async_db.execute = AsyncMock(return_value=exec_result)
    async_db.commit = AsyncMock()

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, fake_session


# ---------------------------------------------------------------------------
# _load_message_history — no summary
# ---------------------------------------------------------------------------


async def test_load_message_history_no_summary_returns_messages():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-1")
    assert len(history) == 4


async def test_load_message_history_no_summary_correct_roles():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-1")
    roles = [h["role"] for h in history]
    assert roles == ["user", "assistant", "user", "assistant"]


async def test_load_message_history_session_not_found_returns_empty():
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    async_db = AsyncMock()
    async_db.execute = AsyncMock(return_value=exec_result)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("nonexistent")
    assert history == []


# ---------------------------------------------------------------------------
# _load_message_history — with summary
# ---------------------------------------------------------------------------


async def test_load_message_history_with_summary_prepends_two_context_messages():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs, summary="The party defeated a troll.")
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-2")
    # 2 context messages + 4 real messages
    assert len(history) == 6


async def test_load_message_history_with_summary_first_message_is_user():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs, summary="Earlier adventure.")
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-2")
    assert history[0]["role"] == "user"


async def test_load_message_history_with_summary_content_includes_summary_text():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs, summary="Earlier adventure.")
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-2")
    assert "Earlier adventure." in history[0]["content"]


async def test_load_message_history_with_summary_second_message_is_assistant():
    msgs = _make_messages(4)
    cm, _ = _make_session_cm(msgs, summary="The dragon was defeated.")
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-2")
    assert history[1]["role"] == "assistant"


async def test_load_message_history_system_role_mapped_to_user():
    msgs = [{"id": "0", "role": "system", "text": "Dice rolled: 15", "timestamp": "t"}]
    cm, _ = _make_session_cm(msgs)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        history = await _load_message_history("sess-3")
    assert history[0]["role"] == "user"


# ---------------------------------------------------------------------------
# _maybe_summarize_session — below threshold
# ---------------------------------------------------------------------------


async def test_maybe_summarize_does_nothing_when_below_threshold():
    msgs = _make_messages(SUMMARY_THRESHOLD)  # exactly at threshold, not over
    cm, session = _make_session_cm(msgs)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        await _maybe_summarize_session("sess-4")
    # messages should be unchanged
    assert session.messages == json.dumps(msgs)


# ---------------------------------------------------------------------------
# _maybe_summarize_session — above threshold
# ---------------------------------------------------------------------------


async def test_maybe_summarize_calls_summarize_history_when_over_threshold():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_session_cm(msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary text") as mock_sum,
    ):
        await _maybe_summarize_session("sess-5")
    mock_sum.assert_awaited_once()


async def test_maybe_summarize_keeps_recent_messages():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, session = _make_session_cm(msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary text"),
    ):
        await _maybe_summarize_session("sess-6")
    kept = json.loads(session.messages)
    assert len(kept) == SUMMARY_KEEP_RECENT
    assert kept == msgs[-SUMMARY_KEEP_RECENT:]


async def test_maybe_summarize_stores_summary_text():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, session = _make_session_cm(msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Epic summary."),
    ):
        await _maybe_summarize_session("sess-7")
    assert session.session_summary == "Epic summary."


async def test_maybe_summarize_commits_db():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_session_cm(msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary."),
    ):
        await _maybe_summarize_session("sess-8")
    cm.__aenter__.return_value.commit.assert_awaited_once()


async def test_maybe_summarize_passes_existing_summary_to_summarize_history():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_session_cm(msgs, summary="Old summary.")
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="New summary.") as mock_sum,
    ):
        await _maybe_summarize_session("sess-9")
    call_kwargs = mock_sum.call_args
    assert call_kwargs[1]["existing_summary"] == "Old summary."


async def test_maybe_summarize_swallows_summarize_history_exception():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_session_cm(msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, side_effect=RuntimeError("API down")),
    ):
        # Should not raise
        await _maybe_summarize_session("sess-10")


async def test_maybe_summarize_does_nothing_when_session_not_found():
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    async_db = AsyncMock()
    async_db.execute = AsyncMock(return_value=exec_result)
    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        # Should not raise
        await _maybe_summarize_session("nonexistent")


# ---------------------------------------------------------------------------
# Constants sanity
# ---------------------------------------------------------------------------


def test_summary_threshold_greater_than_keep_recent():
    assert SUMMARY_THRESHOLD > SUMMARY_KEEP_RECENT


def test_summary_keep_recent_positive():
    assert SUMMARY_KEEP_RECENT > 0

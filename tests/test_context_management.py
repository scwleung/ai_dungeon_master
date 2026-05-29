"""Unit tests for rolling-window context management in backend/main.py."""

import json
from unittest.mock import AsyncMock, MagicMock, patch


from backend.main import (
    SUMMARY_KEEP_RECENT,
    SUMMARY_THRESHOLD,
    _fetch_previous_session_summary,
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


# -- Low-level mock-result builders ------------------------------------------


def _scalar_one_or_none_result(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _scalar_result(value):
    r = MagicMock()
    r.scalar.return_value = value
    return r


def _scalars_result(items):
    scalars = MagicMock()
    scalars.all.return_value = items
    r = MagicMock()
    r.scalars.return_value = scalars
    return r


# -- Higher-level helpers ----------------------------------------------------


def _make_session_cm(messages: list[dict], summary: str | None = None):
    """Mock for _load_message_history — always 2 db.execute calls.

    Call 1: select(GameSession)  → scalar_one_or_none() → fake_session
    Call 2: select(SessionMessage) → scalars().all() → [] (forces legacy JSON blob fallback)
    """
    fake_session = MagicMock()
    fake_session.messages = json.dumps(messages)
    fake_session.session_summary = summary
    fake_session.campaign_id = "camp-1"
    fake_session.id = "sess-current"

    async_db = AsyncMock()
    async_db.execute = AsyncMock(side_effect=[
        _scalar_one_or_none_result(fake_session),
        _scalars_result([]),  # empty → code falls back to session.messages JSON blob
    ])
    async_db.commit = AsyncMock()

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, fake_session


def _make_summarize_cm(n_count: int, messages: list[dict], summary: str | None = None):
    """Mock for _maybe_summarize_session.

    When n_count <= SUMMARY_THRESHOLD: 1 db.execute call (count only).
    When n_count > SUMMARY_THRESHOLD: 3 db.execute calls (count, session, all messages).
    Returns (cm, fake_session).
    """
    fake_session = MagicMock()
    fake_session.messages = json.dumps(messages)
    fake_session.session_summary = summary
    fake_session.campaign_id = "camp-1"
    fake_session.id = "sess-current"

    count_result = _scalar_result(n_count)

    if n_count <= SUMMARY_THRESHOLD:
        side_effects = [count_result]
    else:
        fake_msg_objects = []
        for i, m in enumerate(messages):
            obj = MagicMock()
            obj.role = m["role"]
            obj.text = m["text"]
            obj.seq = i
            fake_msg_objects.append(obj)

        side_effects = [
            count_result,
            _scalar_one_or_none_result(fake_session),
            _scalars_result(fake_msg_objects),
        ]

    async_db = AsyncMock()
    async_db.execute = AsyncMock(side_effect=side_effects)
    async_db.commit = AsyncMock()
    async_db.delete = AsyncMock()

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, fake_session


def _make_cross_session_cm(
    prev_messages: list[dict],
    prev_summary: str | None = None,
    prev_session_exists: bool = True,
):
    """Mock for _fetch_previous_session_summary.

    No prior session → 1 execute call returning None.
    Prior session with summary → 1 execute call returning prev_session.
    Prior session without summary → 2 execute calls (prev_session + empty SessionMessages).

    Returns (cm, prev_session_or_None).
    """
    if not prev_session_exists:
        side_effects = [_scalar_one_or_none_result(None)]
        prev_session = None
    else:
        prev_session = MagicMock()
        prev_session.messages = json.dumps(prev_messages)
        prev_session.session_summary = prev_summary
        prev_session.id = "sess-prev"
        prev_session.campaign_id = "camp-1"

        if prev_summary:
            side_effects = [_scalar_one_or_none_result(prev_session)]
        else:
            # No summary → code also queries session_messages (returns empty here,
            # so it falls back to the legacy JSON blob on prev_session.messages)
            side_effects = [
                _scalar_one_or_none_result(prev_session),
                _scalars_result([]),
            ]

    async_db = AsyncMock()
    async_db.execute = AsyncMock(side_effect=side_effects)
    async_db.commit = AsyncMock()

    cm = MagicMock()
    cm.__aenter__ = AsyncMock(return_value=async_db)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, prev_session


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
    async_db = AsyncMock()
    async_db.execute = AsyncMock(return_value=_scalar_one_or_none_result(None))
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
    cm, session = _make_summarize_cm(SUMMARY_THRESHOLD, msgs)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        await _maybe_summarize_session("sess-4")
    # no summarization should have occurred
    assert session.messages == json.dumps(msgs)


# ---------------------------------------------------------------------------
# _maybe_summarize_session — above threshold
# ---------------------------------------------------------------------------


async def test_maybe_summarize_calls_summarize_history_when_over_threshold():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary text") as mock_sum,
    ):
        await _maybe_summarize_session("sess-5")
    mock_sum.assert_awaited_once()


async def test_maybe_summarize_keeps_recent_messages():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary text"),
    ):
        await _maybe_summarize_session("sess-6")
    # old rows beyond SUMMARY_KEEP_RECENT should have been deleted
    expected_deletes = (SUMMARY_THRESHOLD + 5) - SUMMARY_KEEP_RECENT
    assert cm.__aenter__.return_value.delete.await_count == expected_deletes


async def test_maybe_summarize_stores_summary_text():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, session = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Epic summary."),
    ):
        await _maybe_summarize_session("sess-7")
    assert session.session_summary == "Epic summary."


async def test_maybe_summarize_commits_db():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Summary."),
    ):
        await _maybe_summarize_session("sess-8")
    cm.__aenter__.return_value.commit.assert_awaited_once()


async def test_maybe_summarize_passes_existing_summary_to_summarize_history():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs, summary="Old summary.")
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="New summary.") as mock_sum,
    ):
        await _maybe_summarize_session("sess-9")
    call_kwargs = mock_sum.call_args
    assert call_kwargs[1]["existing_summary"] == "Old summary."


async def test_maybe_summarize_swallows_summarize_history_exception():
    msgs = _make_messages(SUMMARY_THRESHOLD + 5)
    cm, _ = _make_summarize_cm(SUMMARY_THRESHOLD + 5, msgs)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, side_effect=RuntimeError("API down")),
    ):
        # Should not raise
        await _maybe_summarize_session("sess-10")


async def test_maybe_summarize_does_nothing_when_session_not_found():
    # count > threshold so we proceed past the early-return, but session lookup returns None
    async_db = AsyncMock()
    async_db.execute = AsyncMock(side_effect=[
        _scalar_result(SUMMARY_THRESHOLD + 1),
        _scalar_one_or_none_result(None),
    ])
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


# ---------------------------------------------------------------------------
# _fetch_previous_session_summary — direct tests
# ---------------------------------------------------------------------------


async def test_fetch_previous_no_prior_session_returns_empty():
    cm, _ = _make_cross_session_cm([], prev_session_exists=False)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        result = await _fetch_previous_session_summary("camp-1", "sess-current")
    assert result == ""


async def test_fetch_previous_returns_existing_summary():
    cm, _ = _make_cross_session_cm([], prev_summary="The party slew the troll.")
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        result = await _fetch_previous_session_summary("camp-1", "sess-current")
    assert result == "The party slew the troll."


async def test_fetch_previous_generates_summary_from_messages():
    prev_msgs = _make_messages(4)
    cm, _ = _make_cross_session_cm(prev_msgs, prev_summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Generated summary."),
    ):
        result = await _fetch_previous_session_summary("camp-1", "sess-current")
    assert result == "Generated summary."


async def test_fetch_previous_caches_generated_summary_on_prev_session():
    prev_msgs = _make_messages(4)
    cm, prev_session_obj = _make_cross_session_cm(prev_msgs, prev_summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, return_value="Cached."),
    ):
        await _fetch_previous_session_summary("camp-1", "sess-current")
    assert prev_session_obj.session_summary == "Cached."


async def test_fetch_previous_empty_prev_messages_returns_empty():
    cm, _ = _make_cross_session_cm([], prev_summary=None)
    with patch("backend.main.AsyncSessionLocal", return_value=cm):
        result = await _fetch_previous_session_summary("camp-1", "sess-current")
    assert result == ""


async def test_fetch_previous_swallows_summarize_exception():
    prev_msgs = _make_messages(4)
    cm, _ = _make_cross_session_cm(prev_msgs, prev_summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=cm),
        patch.object(dm, "summarize_history", new_callable=AsyncMock, side_effect=RuntimeError("down")),
    ):
        result = await _fetch_previous_session_summary("camp-1", "sess-current")
    assert result == ""


# ---------------------------------------------------------------------------
# _load_message_history — cross-session inheritance integration
# ---------------------------------------------------------------------------


async def test_load_history_empty_session_queries_previous_session():
    # Current session is empty; _fetch_previous_session_summary is also called
    current_cm, _ = _make_session_cm([], summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
            return_value="Inherited context.",
        ) as mock_fetch,
    ):
        await _load_message_history("sess-current")
    mock_fetch.assert_awaited_once()


async def test_load_history_empty_session_inherits_previous_summary():
    current_cm, _ = _make_session_cm([], summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
            return_value="Inherited context.",
        ),
    ):
        history = await _load_message_history("sess-current")
    # Two synthetic context messages + no real messages
    assert len(history) == 2
    assert "Inherited context." in history[0]["content"]


async def test_load_history_empty_session_caches_inherited_summary():
    current_cm, current_session = _make_session_cm([], summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
            return_value="Cached context.",
        ),
    ):
        await _load_message_history("sess-current")
    assert current_session.session_summary == "Cached context."
    current_cm.__aenter__.return_value.commit.assert_awaited_once()


async def test_load_history_empty_session_no_previous_context_returns_no_context():
    current_cm, _ = _make_session_cm([], summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
            return_value="",
        ),
    ):
        history = await _load_message_history("sess-current")
    assert history == []


async def test_load_history_non_empty_session_does_not_query_previous():
    # Session already has messages — should NOT call _fetch_previous_session_summary
    current_cm, _ = _make_session_cm(_make_messages(4), summary=None)
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
            return_value="Should not be used.",
        ) as mock_fetch,
    ):
        history = await _load_message_history("sess-current")
    mock_fetch.assert_not_awaited()
    assert len(history) == 4  # just the 4 real messages, no context prefix


async def test_load_history_session_with_own_summary_does_not_query_previous():
    # Session has its own summary — no need to look at previous sessions
    current_cm, _ = _make_session_cm([], summary="My own summary.")
    with (
        patch("backend.main.AsyncSessionLocal", return_value=current_cm),
        patch(
            "backend.main._fetch_previous_session_summary",
            new_callable=AsyncMock,
        ) as mock_fetch,
    ):
        history = await _load_message_history("sess-current")
    mock_fetch.assert_not_awaited()
    assert "My own summary." in history[0]["content"]

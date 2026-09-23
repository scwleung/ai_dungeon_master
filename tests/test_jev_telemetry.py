"""Tests for live Jev shadow orchestration and telemetry boundaries."""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from backend.services import jev_live_shadow


@pytest.mark.asyncio
async def test_start_shadow_disabled_returns_none(monkeypatch):
    monkeypatch.setattr(jev_live_shadow.jev_shadow, "enabled", lambda: False)
    assert jev_live_shadow.start_shadow_evaluation(
        action_text="I climb the wall",
        player_name="Ada",
        campaign=SimpleNamespace(),
        characters=[],
        history=[],
        in_combat=False,
    ) is None


@pytest.mark.asyncio
async def test_finish_persists_without_returning_decision(monkeypatch):
    evaluation = SimpleNamespace(to_dict=lambda: {"adjudication": "roll_required"})

    async def completed():
        return evaluation

    task = __import__("asyncio").create_task(completed())
    persist = AsyncMock()
    monkeypatch.setattr(jev_live_shadow, "persist_shadow_evaluation", persist)

    result = await jev_live_shadow.finish_shadow_evaluation(
        task,
        session_id="session-1",
        campaign_id="campaign-1",
        player_id="player-1",
        player_name="Ada",
        action_text="I climb the wall",
        claude_response="Make an Athletics check.",
    )

    assert result is None
    persist.assert_awaited_once()
    kwargs = persist.await_args.kwargs
    assert kwargs["evaluation"] is evaluation
    assert kwargs["claude_response"] == "Make an Athletics check."


@pytest.mark.asyncio
async def test_finish_is_fail_open_when_evaluator_task_raises(monkeypatch):
    async def broken():
        raise RuntimeError("Jev unavailable")

    task = __import__("asyncio").create_task(broken())
    persist = AsyncMock()
    monkeypatch.setattr(jev_live_shadow, "persist_shadow_evaluation", persist)

    assert await jev_live_shadow.finish_shadow_evaluation(
        task,
        session_id="session-1",
        campaign_id="campaign-1",
        player_id=None,
        player_name=None,
        action_text="I listen at the door",
        claude_response="You hear footsteps.",
    ) is None
    persist.assert_not_awaited()

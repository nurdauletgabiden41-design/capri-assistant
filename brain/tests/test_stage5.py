"""Unit tests for Stage 5: LLM Client, Memory Store, Budget, Keychain, and Persona."""

import os
from unittest.mock import MagicMock, patch

import pytest

from brain.llm.budget import BudgetTracker, estimate_cost
from brain.llm.client import OpenRouterClient
from brain.llm.persona import build_system_prompt
from brain.memory.store import MemoryStore
from brain.security import keychain

# --- Keychain Tests ---


def test_keychain_operations():
    with (
        patch("keyring.get_password", return_value="sk-or-test-12345"),
        patch("keyring.set_password") as mock_set,
        patch("keyring.delete_password") as mock_del,
    ):
        # Clear env override if set
        os.environ.pop("OPENROUTER_API_KEY", None)

        assert keychain.get_api_key() == "sk-or-test-12345"

        keychain.set_api_key("sk-or-new-key")
        mock_set.assert_called_once_with(keychain.SERVICE_NAME, keychain.USERNAME, "sk-or-new-key")

        keychain.delete_api_key()
        mock_del.assert_called_once_with(keychain.SERVICE_NAME, keychain.USERNAME)


def test_keychain_env_override():
    with patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-or-env-override"}):
        assert keychain.get_api_key() == "sk-or-env-override"


# --- Memory Store Tests ---


def test_memory_store_messages():
    store = MemoryStore(":memory:")
    session_id = "test-session-1"

    # Add 25 messages
    for i in range(25):
        store.add_message(session_id, "user" if i % 2 == 0 else "assistant", f"Msg {i}")

    # Sliding window should return only the last 20 messages
    recent = store.get_recent_messages(session_id, limit=20)
    assert len(recent) == 20
    assert recent[0]["content"] == "Msg 5"
    assert recent[-1]["content"] == "Msg 24"


def test_memory_store_facts():
    store = MemoryStore(":memory:")

    store.set_fact("editor", "VS Code")
    store.set_fact("preferred_music", "Synthwave")

    facts = store.get_facts()
    assert facts["editor"] == "VS Code"
    assert facts["preferred_music"] == "Synthwave"

    # Update an existing fact
    store.set_fact("editor", "Antigravity IDE")
    assert store.get_facts()["editor"] == "Antigravity IDE"


def test_memory_store_sessions_and_daily_cost():
    store = MemoryStore(":memory:")

    store.record_session(
        session_id="s1",
        started_at="2026-10-27T10:00:00Z",
        duration_ms=4500,
        cost_usd=0.0025,
        tokens_in=100,
        tokens_out=50,
        actions_count=2,
    )
    store.record_session(
        session_id="s2",
        started_at="2026-10-27T11:00:00Z",
        duration_ms=3000,
        cost_usd=0.0035,
        tokens_in=150,
        tokens_out=80,
        actions_count=1,
    )

    cost_today = store.get_daily_cost("2026-10-27")
    assert round(cost_today, 4) == 0.0060

    cost_other_day = store.get_daily_cost("2026-10-28")
    assert cost_other_day == 0.0


# --- Budget Tracker Tests ---


def test_estimate_cost():
    # 1,000,000 in ($0.80) + 1,000,000 out ($4.00) = $4.80 for haiku
    cost = estimate_cost("anthropic/claude-haiku-5.5", 1_000_000, 1_000_000)
    assert cost == 4.80


def test_budget_tracker_limits():
    store = MemoryStore(":memory:")
    tracker = BudgetTracker(daily_limit_usd=0.50, store=store)

    assert tracker.is_within_budget(0.10) is True
    assert tracker.get_remaining_budget() == 0.50

    # Record spend of $0.48
    store.record_session(
        "s-budget",
        started_at="2026-10-27T12:00:00Z",
        duration_ms=1000,
        cost_usd=0.48,
        tokens_in=1000,
        tokens_out=1000,
        actions_count=0,
    )

    with patch("brain.llm.budget.datetime") as mock_dt:
        mock_dt.now.return_value.strftime.return_value = "2026-10-27"
        mock_dt.timezone = MagicMock()

        assert tracker.is_within_budget(0.01) is True
        assert tracker.is_within_budget(0.03) is False
        assert round(tracker.get_remaining_budget(), 2) == 0.02


# --- Persona Prompt Tests ---


def test_persona_prompt_generation():
    prompt_no_facts = build_system_prompt()
    assert "Капри" in prompt_no_facts
    assert "Trigger" in prompt_no_facts

    facts = {"editor": "VS Code", "music": "Synthwave"}
    prompt_with_facts = build_system_prompt(facts)
    assert "- editor: VS Code" in prompt_with_facts
    assert "- music: Synthwave" in prompt_with_facts


# --- LLM Client Tests (Mocked OpenRouter) ---


@pytest.mark.asyncio
async def test_llm_client_streaming_and_fallback():
    client = OpenRouterClient(
        api_key="sk-or-mock",
        models=["mock/primary-fail", "mock/fallback-success"],
    )

    # First model raises error, second model yields chunks
    mock_chunk1 = MagicMock()
    mock_choice1 = MagicMock()
    mock_choice1.delta.content = "Привет, "
    mock_choice1.finish_reason = None
    mock_chunk1.choices = [mock_choice1]
    mock_chunk1.usage = None

    mock_chunk2 = MagicMock()
    mock_choice2 = MagicMock()
    mock_choice2.delta.content = "хост!"
    mock_choice2.finish_reason = "stop"
    mock_chunk2.choices = [mock_choice2]
    mock_chunk2.usage = None

    async def mock_stream_success(*args, **kwargs):
        yield mock_chunk1
        yield mock_chunk2

    async def mock_create(**kwargs):
        model = kwargs.get("model")
        if model == "mock/primary-fail":
            raise RuntimeError("Rate limit on primary model")
        return mock_stream_success()

    with patch.object(client._client.chat.completions, "create", side_effect=mock_create):
        messages = [{"role": "user", "content": "Тест"}]
        collected_deltas = []
        final_chunk = None

        async for chunk in client.stream_chat(messages):
            if chunk.delta:
                collected_deltas.append(chunk.delta)
            if chunk.finish_reason == "stop":
                final_chunk = chunk

        assert "".join(collected_deltas) == "Привет, хост!"
        assert final_chunk is not None
        assert final_chunk.model_used == "mock/fallback-success"
        assert final_chunk.usage is not None

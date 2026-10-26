"""Tests for Capri IPC protocol validation and serialization."""

import pytest

from brain.ipc.protocol import (
    deserialize_message,
    serialize_message,
    validate_brain_message,
    validate_host_message,
)


def test_valid_host_messages():
    """Verify standard Host -> Brain messages validate cleanly."""
    valid_samples = [
        {"type": "handshake", "token": "a" * 32},
        {"type": "user_text", "text": "Hello Capri"},
        {"type": "ptt_start"},
        {"type": "ptt_stop"},
        {"type": "approval_response", "id": "test-123", "approved": True},
        {"type": "abort"},
        {"type": "settings_update", "settings": {"lang": "ru"}},
        {"type": "ping", "timestamp": 123456789},
    ]
    for msg in valid_samples:
        validate_host_message(msg)


def test_invalid_host_messages():
    """Verify malformed Host messages are rejected."""
    invalid_samples = [
        {},  # missing type
        {"type": "handshake", "token": "short"},  # token too short
        {"type": "user_text"},  # missing text
        {"type": "approval_response", "id": "1"},  # missing approved bool
        {"type": "unknown_type"},  # unknown
    ]
    for msg in invalid_samples:
        with pytest.raises(ValueError):
            validate_host_message(msg)


def test_valid_brain_messages():
    """Verify standard Brain -> Host messages validate cleanly."""
    valid_samples = [
        {"type": "session_start", "version": "0.1.0", "active_model": "haiku-5.5"},
        {"type": "listening_start"},
        {"type": "listening_level", "level": 0.5},
        {"type": "listening_end"},
        {"type": "transcript", "text": "hey", "is_final": True},
        {"type": "thinking_start"},
        {"type": "thinking_tick", "elapsed_sec": 10},
        {"type": "thinking_end"},
        {"type": "assistant_delta", "text": "hi"},
        {"type": "assistant_message", "text": "Hi!", "face": "smug"},
        {"type": "tool_start", "tool": "test", "target": "x", "ticker": "TEST"},
        {"type": "tool_end", "tool": "test", "ok": True},
        {
            "type": "needs_approval",
            "id": "1",
            "kind": "write_file",
            "summary": "write",
            "details": "foo",
        },
        {"type": "approval_resolved", "id": "1", "approved": True},
        {"type": "tts_start"},
        {"type": "tts_level", "level": 0.3},
        {"type": "tts_end"},
        {
            "type": "task_done",
            "actions": 2,
            "files_changed": 1,
            "duration_ms": 500,
            "last_sentence": "Done",
        },
        {
            "type": "usage",
            "tokens_in": 10,
            "tokens_out": 20,
            "cost_usd": 0.001,
            "day_cost_usd": 0.02,
        },
        {"type": "error", "message": "Failed"},
        {"type": "pong"},
    ]
    for msg in valid_samples:
        validate_brain_message(msg)
        s = serialize_message(msg)
        assert "type" in s


def test_invalid_brain_messages():
    """Verify invalid Brain messages fail validation."""
    invalid = [
        {"type": "session_start"},  # missing fields
        {"type": "assistant_message", "text": "hey", "face": "invalid_face"},
        {"type": "listening_level", "level": 1.5},  # > 1.0
        {"type": "task_done", "actions": -1},  # negative
    ]
    for msg in invalid:
        with pytest.raises(ValueError):
            validate_brain_message(msg)


def test_roundtrip_deserialize():
    """Verify JSON deserialization of incoming host payload."""
    raw = '{"type": "user_text", "text": "test"}'
    msg = deserialize_message(raw)
    assert msg["type"] == "user_text"
    assert msg["text"] == "test"

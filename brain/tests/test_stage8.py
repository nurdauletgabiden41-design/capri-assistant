"""Unit tests for Stage 8 Agent-Character Integration and Event Bus."""

from brain.ipc.protocol import validate_brain_message


def test_thinking_tick_event_schema():
    msg = {
        "type": "thinking_tick",
        "elapsed_sec": 16,
    }
    # Validate conforms to protocol schema
    validate_brain_message(msg)


def test_error_event_schema():
    msg = {
        "type": "error",
        "message": "OpenRouter API rate limit reached (429).",
        "code": "RATE_LIMIT",
    }
    validate_brain_message(msg)


def test_task_done_event_schema():
    msg = {
        "type": "task_done",
        "actions": 5,
        "files_changed": 2,
        "duration_ms": 4200,
        "last_sentence": "Все файлы обновлены, сборка чистая.",
    }
    validate_brain_message(msg)


def test_tool_start_and_end_events():
    msg_start = {
        "type": "tool_start",
        "tool": "open_app",
        "target": "spotify",
        "ticker": "LAUNCHES spotify",
    }
    validate_brain_message(msg_start)

    msg_end = {
        "type": "tool_end",
        "tool": "open_app",
        "ok": True,
    }
    validate_brain_message(msg_end)

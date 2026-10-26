"""Protocol validation and message serialization for Capri Brain.

Validates incoming and outgoing WebSocket frames against the schemas in shared/schemas/.
"""

import json
from pathlib import Path
from typing import Any

import jsonschema

SCHEMAS_DIR = Path(__file__).resolve().parent.parent.parent / "shared" / "schemas"
HOST_SCHEMA_FILE = SCHEMAS_DIR / "host_messages.json"
BRAIN_SCHEMA_FILE = SCHEMAS_DIR / "brain_messages.json"

with open(HOST_SCHEMA_FILE, encoding="utf-8") as f:
    HOST_SCHEMA = json.load(f)

with open(BRAIN_SCHEMA_FILE, encoding="utf-8") as f:
    BRAIN_SCHEMA = json.load(f)

_host_validator = jsonschema.Draft7Validator(HOST_SCHEMA)
_brain_validator = jsonschema.Draft7Validator(BRAIN_SCHEMA)


def validate_host_message(msg: dict[str, Any]) -> None:
    """Validate a message sent by Electron Host to Python Brain."""
    errors = list(_host_validator.iter_errors(msg))
    if errors:
        first = errors[0]
        raise ValueError(f"Invalid host message '{msg.get('type')}': {first.message}")


def validate_brain_message(msg: dict[str, Any]) -> None:
    """Validate a message sent by Python Brain to Electron Host."""
    errors = list(_brain_validator.iter_errors(msg))
    if errors:
        first = errors[0]
        raise ValueError(f"Invalid brain message '{msg.get('type')}': {first.message}")


def serialize_message(msg: dict[str, Any]) -> str:
    """Validate and serialize a Brain -> Host message into a JSON string."""
    validate_brain_message(msg)
    return json.dumps(msg, ensure_ascii=False)


def deserialize_message(raw_text: str) -> dict[str, Any]:
    """Deserialize and validate a Host -> Brain message from a JSON string."""
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Malformed JSON: {e}") from e

    if not isinstance(data, dict):
        raise TypeError(f"Expected JSON object, got {type(data).__name__}")

    validate_host_message(data)
    return data

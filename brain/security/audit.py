"""Audit logging for tracking all executed Capri actions and tool calls."""

import json
import logging
import os
import re
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger("capri.brain.audit")

SECRET_KEY_PATTERN = re.compile(r"sk-[a-zA-Z0-9_-]{20,}")


def get_actions_log_path() -> Path:
    """Returns absolute path to actions.log in Capri's APPDATA folder."""
    app_data = os.environ.get("APPDATA")
    if app_data:
        base = Path(app_data) / "Capri" / "logs"
    else:
        base = Path.home() / ".capri" / "logs"
    base.mkdir(parents=True, exist_ok=True)
    return base / "actions.log"


def mask_sensitive(text: str) -> str:
    """Masks API keys and credential strings."""
    return SECRET_KEY_PATTERN.sub("sk-***MASKED***", text)


class ActionLogger:
    """Persists timestamped action records to actions.log."""

    def __init__(self, log_path: Path | None = None) -> None:
        self.log_path = log_path or get_actions_log_path()

    def record(
        self,
        tool: str,
        target: str,
        status: str,
        approved: bool | None = None,
        details: str = "",
    ) -> None:
        """Appends a sanitized record entry into actions.log."""
        entry = {
            "timestamp": datetime.now(UTC).isoformat(),
            "tool": tool,
            "target": mask_sensitive(str(target)),
            "status": status,
            "approved": approved,
            "details": mask_sensitive(str(details)),
        }
        try:
            line = json.dumps(entry, ensure_ascii=False)
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception as err:
            logger.error("Failed to write to actions.log: %s", err)

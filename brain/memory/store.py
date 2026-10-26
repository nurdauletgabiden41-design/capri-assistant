"""SQLite-backed persistent memory store for Capri Brain."""

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def get_default_db_path() -> Path:
    """Get the standard path for memory.db in %APPDATA%/Capri/."""
    override = os.environ.get("CAPRI_DB_PATH")
    if override:
        return Path(override)
    appdata = os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming"))
    capri_dir = Path(appdata) / "Capri"
    capri_dir.mkdir(parents=True, exist_ok=True)
    return capri_dir / "memory.db"


class MemoryStore:
    """Manages conversations, user facts, and session statistics."""

    def __init__(self, db_path: Path | str | None = None) -> None:
        if db_path is None:
            self.db_path = get_default_db_path()
        else:
            self.db_path = Path(db_path) if str(db_path) != ":memory:" else db_path

        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        if str(self.db_path) == ":memory:":
            if not hasattr(self, "_memory_conn"):
                self._memory_conn = sqlite3.connect(":memory:")
            return self._memory_conn
        return sqlite3.connect(str(self.db_path))

    def _init_db(self) -> None:
        conn = self._get_connection()
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    started_at TEXT NOT NULL,
                    duration_ms INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0.0,
                    tokens_in INTEGER DEFAULT 0,
                    tokens_out INTEGER DEFAULT 0,
                    actions_count INTEGER DEFAULT 0
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS facts (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT,
                    tool_calls TEXT,
                    timestamp TEXT NOT NULL
                )
            """)
        if str(self.db_path) != ":memory:":
            conn.close()

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
    ) -> None:
        """Store a single message in the current session."""
        now = datetime.now(UTC).isoformat()
        tool_calls_json = json.dumps(tool_calls) if tool_calls else None

        conn = self._get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO messages (session_id, role, content, tool_calls, timestamp)
                VALUES (?, ?, ?, ?, ?)
            """,
                (session_id, role, content, tool_calls_json, now),
            )
        if str(self.db_path) != ":memory:":
            conn.close()

    def get_recent_messages(
        self, session_id: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        """Retrieve the last `limit` messages (sliding window) ordered chronologically."""
        conn = self._get_connection()
        cursor = conn.cursor()

        if session_id:
            cursor.execute(
                """
                SELECT role, content, tool_calls
                FROM (
                    SELECT id, role, content, tool_calls
                    FROM messages
                    WHERE session_id = ?
                    ORDER BY id DESC
                    LIMIT ?
                )
                ORDER BY id ASC
            """,
                (session_id, limit),
            )
        else:
            cursor.execute(
                """
                SELECT role, content, tool_calls
                FROM (
                    SELECT id, role, content, tool_calls
                    FROM messages
                    ORDER BY id DESC
                    LIMIT ?
                )
                ORDER BY id ASC
            """,
                (limit,),
            )

        rows = cursor.fetchall()
        if str(self.db_path) != ":memory:":
            conn.close()

        messages: list[dict[str, Any]] = []
        for role, content, tool_calls_raw in rows:
            msg: dict[str, Any] = {"role": role, "content": content or ""}
            if tool_calls_raw:
                try:
                    msg["tool_calls"] = json.loads(tool_calls_raw)
                except Exception:
                    pass
            messages.append(msg)
        return messages

    def set_fact(self, key: str, value: str) -> None:
        """Store or update a learned fact about the user/workspace."""
        now = datetime.now(UTC).isoformat()
        conn = self._get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO facts (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
                (key, value, now),
            )
        if str(self.db_path) != ":memory:":
            conn.close()

    def get_facts(self) -> dict[str, str]:
        """Retrieve all stored user facts as a dictionary."""
        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM facts ORDER BY key ASC")
        rows = cursor.fetchall()
        if str(self.db_path) != ":memory:":
            conn.close()
        return {k: v for k, v in rows}

    def record_session(
        self,
        session_id: str,
        started_at: str,
        duration_ms: int,
        cost_usd: float,
        tokens_in: int,
        tokens_out: int,
        actions_count: int,
    ) -> None:
        """Record or update completed session usage statistics."""
        conn = self._get_connection()
        with conn:
            conn.execute(
                """
                INSERT INTO sessions (id, started_at, duration_ms, cost_usd, tokens_in, tokens_out, actions_count)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    duration_ms = excluded.duration_ms,
                    cost_usd = excluded.cost_usd,
                    tokens_in = excluded.tokens_in,
                    tokens_out = excluded.tokens_out,
                    actions_count = excluded.actions_count
            """,
                (
                    session_id,
                    started_at,
                    duration_ms,
                    cost_usd,
                    tokens_in,
                    tokens_out,
                    actions_count,
                ),
            )
        if str(self.db_path) != ":memory:":
            conn.close()

    def get_daily_cost(self, date_prefix: str | None = None) -> float:
        """Calculate total USD spent for the given date prefix (YYYY-MM-DD), default today."""
        if not date_prefix:
            date_prefix = datetime.now(UTC).strftime("%Y-%m-%d")

        conn = self._get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT COALESCE(SUM(cost_usd), 0.0)
            FROM sessions
            WHERE started_at LIKE ?
        """,
            (f"{date_prefix}%",),
        )
        total = float(cursor.fetchone()[0])
        if str(self.db_path) != ":memory:":
            conn.close()
        return total

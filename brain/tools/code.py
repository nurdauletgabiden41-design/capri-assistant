"""Python code execution tool with subprocess isolation, safety scan, and timeout."""

import re
import subprocess
import sys

from brain.security.injection import wrap_untrusted
from brain.tools.base import ToolResult

DESTRUCTIVE_PATTERNS = [
    re.compile(r"\bshutil\.rmtree\b"),
    re.compile(r"\bos\.(remove|unlink|rmdir)\b"),
    re.compile(r"\bPath\.[a-zA-Z_]*unlink\b"),
    re.compile(r"\bformat\s+[a-zA-Z]:", re.IGNORECASE),
    re.compile(r"\brmdir\s+/[sS]", re.IGNORECASE),
    re.compile(r"\bdel\s+/[fF]", re.IGNORECASE),
]


async def run_python(code: str, timeout_sec: float = 15.0) -> ToolResult:
    """Executes Python code in an isolated child process (Requires User Approval)."""
    # 1. Inspect for destructive file removal or disk formatting
    for pattern in DESTRUCTIVE_PATTERNS:
        if pattern.search(code):
            return ToolResult(
                ok=False,
                error="Safety violation: Destructive file deletion or disk modification commands are strictly forbidden.",
            )

    # 2. Run isolated subprocess using current python interpreter
    try:
        proc = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )

        stdout_trimmed = proc.stdout[:4000]
        stderr_trimmed = proc.stderr[:4000]

        combined = []
        if stdout_trimmed:
            combined.append(f"STDOUT:\n{stdout_trimmed}")
        if stderr_trimmed:
            combined.append(f"STDERR:\n{stderr_trimmed}")
        if not combined:
            combined.append("Code executed cleanly with no output.")

        combined_text = "\n\n".join(combined)
        return ToolResult(
            ok=proc.returncode == 0,
            output=wrap_untrusted("run_python", combined_text),
            error=None if proc.returncode == 0 else f"Process exited with code {proc.returncode}",
        )

    except subprocess.TimeoutExpired:
        return ToolResult(
            ok=False,
            error=f"Execution timed out after {timeout_sec} seconds.",
        )
    except Exception as err:
        return ToolResult(ok=False, error=f"Execution failed: {err}")

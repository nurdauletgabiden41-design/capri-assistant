"""Filesystem manipulation tools: sandboxed listing, reading, writing, and editing."""

from typing import Any

from brain.security.injection import wrap_untrusted
from brain.security.sandbox import SandboxSecurityError, validate_path
from brain.tools.base import ToolResult


async def list_dir(path: str = ".") -> ToolResult:
    """Lists files and subdirectories in a sandboxed directory."""
    try:
        resolved = validate_path(path)
        if not resolved.exists():
            return ToolResult(ok=False, error=f"Directory '{path}' does not exist.")
        if not resolved.is_dir():
            return ToolResult(ok=False, error=f"Path '{path}' is not a directory.")

        entries: list[dict[str, Any]] = []
        for item in sorted(resolved.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            try:
                st = item.stat()
                entries.append(
                    {
                        "name": item.name,
                        "is_dir": item.is_dir(),
                        "size_bytes": st.st_size if not item.is_dir() else 0,
                    }
                )
            except (PermissionError, OSError):
                continue

        formatted_list = "\n".join(
            f"[{'DIR' if e['is_dir'] else 'FILE'}] {e['name']}"
            + (f" ({e['size_bytes']} bytes)" if not e["is_dir"] else "")
            for e in entries
        )
        return ToolResult(
            ok=True,
            output=wrap_untrusted(f"list_dir:{resolved.name}", formatted_list),
        )
    except SandboxSecurityError as sec_err:
        return ToolResult(ok=False, error=str(sec_err))
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to list directory: {err}")


async def read_file(path: str, offset: int = 0, limit: int = 200) -> ToolResult:
    """Reads lines from a sandboxed text file."""
    try:
        resolved = validate_path(path)
        if not resolved.exists():
            return ToolResult(ok=False, error=f"File '{path}' does not exist.")
        if not resolved.is_file():
            return ToolResult(ok=False, error=f"Path '{path}' is not a regular file.")

        with open(resolved, encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()

        start = max(0, offset)
        clamped_limit = max(1, min(limit, 500))
        slice_lines = all_lines[start : start + clamped_limit]

        content = "".join(slice_lines)
        return ToolResult(
            ok=True,
            output=wrap_untrusted(f"read_file:{resolved.name}", content),
        )
    except SandboxSecurityError as sec_err:
        return ToolResult(ok=False, error=str(sec_err))
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to read file: {err}")


async def write_file(path: str, content: str) -> ToolResult:
    """Writes full content to a file inside the sandbox (Requires User Approval)."""
    try:
        resolved = validate_path(path, write=True)
        resolved.parent.mkdir(parents=True, exist_ok=True)

        with open(resolved, "w", encoding="utf-8") as f:
            f.write(content)

        return ToolResult(
            ok=True,
            output={
                "path": str(resolved),
                "bytes_written": len(content.encode("utf-8")),
            },
        )
    except SandboxSecurityError as sec_err:
        return ToolResult(ok=False, error=str(sec_err))
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to write file: {err}")


async def edit_file(path: str, target: str, replacement: str) -> ToolResult:
    """Replaces occurrences of target string in a file (Requires User Approval)."""
    try:
        resolved = validate_path(path, write=True)
        if not resolved.exists() or not resolved.is_file():
            return ToolResult(ok=False, error=f"File '{path}' does not exist.")

        with open(resolved, encoding="utf-8") as f:
            original = f.read()

        if target not in original:
            return ToolResult(
                ok=False,
                error=f"Target string not found in '{resolved.name}'. Match must be exact.",
            )

        occurrences = original.count(target)
        modified = original.replace(target, replacement)

        with open(resolved, "w", encoding="utf-8") as f:
            f.write(modified)

        return ToolResult(
            ok=True,
            output={
                "path": str(resolved),
                "replacements": occurrences,
            },
        )
    except SandboxSecurityError as sec_err:
        return ToolResult(ok=False, error=str(sec_err))
    except Exception as err:
        return ToolResult(ok=False, error=f"Failed to edit file: {err}")

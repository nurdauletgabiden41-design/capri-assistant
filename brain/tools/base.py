"""Base structures and types for Capri tools."""

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Any


@dataclass
class ToolResult:
    """Outcome of a tool invocation."""

    ok: bool
    output: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        res: dict[str, Any] = {"ok": self.ok}
        if self.output is not None:
            res["output"] = self.output
        if self.error is not None:
            res["error"] = self.error
        return res


@dataclass
class ToolDefinition:
    """Specification of an invokable tool."""

    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., Coroutine[Any, Any, ToolResult] | ToolResult]
    requires_approval: bool = False

    def to_openai_schema(self) -> dict[str, Any]:
        """Convert into OpenAI / OpenRouter function calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

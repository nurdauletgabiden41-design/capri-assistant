"""Central registry and dispatcher for Capri tools and function calling schemas."""

import inspect
import logging
from typing import Any

from brain.security.approval import HostApprovalGate
from brain.security.audit import ActionLogger
from brain.tools.base import ToolDefinition, ToolResult
from brain.tools.code import run_python
from brain.tools.desktop import close_app, media_control, open_app, open_url
from brain.tools.filesystem import edit_file, list_dir, read_file, write_file

logger = logging.getLogger("capri.brain.tools")


class ToolRegistry:
    """Manages registration, OpenAPI conversion, approval gate, and execution of tools."""

    def __init__(self, action_logger: ActionLogger | None = None) -> None:
        self.action_logger = action_logger or ActionLogger()
        self._tools: dict[str, ToolDefinition] = {}
        self._register_default_tools()

    def register(self, tool: ToolDefinition) -> None:
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> ToolDefinition | None:
        return self._tools.get(name)

    def get_openai_tools(self) -> list[dict[str, Any]]:
        """Returns schemas for OpenAI/OpenRouter chat completions tools argument."""
        return [tool.to_openai_schema() for tool in self._tools.values()]

    def _register_default_tools(self) -> None:
        # 1. open_url
        self.register(
            ToolDefinition(
                name="open_url",
                description="Open a webpage in the user's default web browser.",
                parameters={
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "Full URL starting with http:// or https://",
                        }
                    },
                    "required": ["url"],
                },
                handler=open_url,
                requires_approval=False,
            )
        )

        # 2. open_app
        self.register(
            ToolDefinition(
                name="open_app",
                description="Launch a desktop application by name (e.g. spotify, chrome, notepad, code) or path.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name_or_path": {
                            "type": "string",
                            "description": "Application name alias or executable command",
                        }
                    },
                    "required": ["name_or_path"],
                },
                handler=open_app,
                requires_approval=False,
            )
        )

        # 3. close_app (Requires Approval)
        self.register(
            ToolDefinition(
                name="close_app",
                description="Close a running application process by name. Requires user confirmation.",
                parameters={
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Application process name to terminate (e.g. notepad, spotify)",
                        }
                    },
                    "required": ["name"],
                },
                handler=close_app,
                requires_approval=True,
            )
        )

        # 4. media_control
        self.register(
            ToolDefinition(
                name="media_control",
                description="Control media playback and system volume via global media keys.",
                parameters={
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["play_pause", "next", "prev", "volume_up", "volume_down", "mute"],
                            "description": "Media action to trigger",
                        }
                    },
                    "required": ["action"],
                },
                handler=media_control,
                requires_approval=False,
            )
        )

        # 5. list_dir
        self.register(
            ToolDefinition(
                name="list_dir",
                description="List files and folders in a sandboxed directory.",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Relative or absolute directory path (defaults to current project)",
                        }
                    },
                },
                handler=list_dir,
                requires_approval=False,
            )
        )

        # 6. read_file
        self.register(
            ToolDefinition(
                name="read_file",
                description="Read lines from a sandboxed text file.",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to file to read",
                        },
                        "offset": {
                            "type": "integer",
                            "description": "Starting line number (0-indexed)",
                        },
                        "limit": {
                            "type": "integer",
                            "description": "Maximum lines to read (max 500)",
                        },
                    },
                    "required": ["path"],
                },
                handler=read_file,
                requires_approval=False,
            )
        )

        # 7. write_file (Requires Approval)
        self.register(
            ToolDefinition(
                name="write_file",
                description="Create or overwrite a file within the sandbox. Requires user confirmation.",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Destination file path",
                        },
                        "content": {
                            "type": "string",
                            "description": "Text content to write",
                        },
                    },
                    "required": ["path", "content"],
                },
                handler=write_file,
                requires_approval=True,
            )
        )

        # 8. edit_file (Requires Approval)
        self.register(
            ToolDefinition(
                name="edit_file",
                description="Find and replace exact text within a sandboxed file. Requires user confirmation.",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Path to target file",
                        },
                        "target": {
                            "type": "string",
                            "description": "Exact text string to find",
                        },
                        "replacement": {
                            "type": "string",
                            "description": "Replacement text string",
                        },
                    },
                    "required": ["path", "target", "replacement"],
                },
                handler=edit_file,
                requires_approval=True,
            )
        )

        # 9. run_python (Requires Approval)
        self.register(
            ToolDefinition(
                name="run_python",
                description="Execute Python code snippet in an isolated subprocess. Requires user confirmation.",
                parameters={
                    "type": "object",
                    "properties": {
                        "code": {
                            "type": "string",
                            "description": "Python code to execute",
                        }
                    },
                    "required": ["code"],
                },
                handler=run_python,
                requires_approval=True,
            )
        )

    def _format_ticker(self, tool_name: str, args: dict[str, Any]) -> tuple[str, str]:
        """Returns (verb_ticker, target) formatted for Electron Host UI."""
        if tool_name == "open_url":
            return f"OPENS {args.get('url', '')[:30]}", args.get("url", "")
        elif tool_name == "open_app":
            return f"LAUNCHES {args.get('name_or_path', '')}", args.get("name_or_path", "")
        elif tool_name == "close_app":
            return f"CLOSES {args.get('name', '')}", args.get("name", "")
        elif tool_name == "media_control":
            return f"MEDIA {args.get('action', '')}", args.get("action", "")
        elif tool_name == "list_dir":
            return f"LISTS {args.get('path', '.')}", args.get("path", ".")
        elif tool_name == "read_file":
            return f"READS {args.get('path', '')}", args.get("path", "")
        elif tool_name == "write_file":
            return f"WRITES {args.get('path', '')}", args.get("path", "")
        elif tool_name == "edit_file":
            return f"EDITS {args.get('path', '')}", args.get("path", "")
        elif tool_name == "run_python":
            return "RUNS python", "python-script"
        return tool_name.upper(), ""

    async def execute(
        self,
        name: str,
        arguments: dict[str, Any],
        approval_gate: HostApprovalGate,
        client: Any,
    ) -> ToolResult:
        """Executes a tool call, routing through approval gate if needed and notifying Host."""
        tool = self.get_tool(name)
        if not tool:
            return ToolResult(ok=False, error=f"Unknown tool '{name}'")

        ticker, target = self._format_ticker(name, arguments)

        # Notify Host UI that tool started
        try:
            await client.send(
                {
                    "type": "tool_start",
                    "tool": name,
                    "target": target,
                    "ticker": ticker,
                }
            )
        except Exception as err:
            logger.warning("Failed to emit tool_start: %s", err)

        # Check approval gate if required
        if tool.requires_approval:
            summary = ticker
            details = f"Tool: {name}\nArguments: {arguments}"
            diff: str | None = None

            if name == "write_file":
                summary = f"WRITE {arguments.get('path', '')}"
                content = arguments.get("content", "")
                preview = content[:200] + ("..." if len(content) > 200 else "")
                details = f"Writing {len(content)} characters to {arguments.get('path')}"
                diff = f"+++ {arguments.get('path')}\n{preview}"
            elif name == "edit_file":
                summary = f"EDIT {arguments.get('path', '')}"
                details = f"Replacing text in {arguments.get('path')}"
                diff = (
                    f"--- {arguments.get('path')}\n"
                    f"- {arguments.get('target', '')[:100]}\n"
                    f"+ {arguments.get('replacement', '')[:100]}"
                )
            elif name == "run_python":
                summary = "RUN PYTHON"
                details = "Executing Python code snippet in isolated child process"
                diff = arguments.get("code", "")[:300]
            elif name == "close_app":
                summary = f"CLOSE {arguments.get('name', '')}"
                details = f"Terminating process '{arguments.get('name')}'"

            approved = await approval_gate.request_approval(
                client=client,
                kind=name,
                summary=summary,
                details=details,
                diff=diff,
            )

            if not approved:
                self.action_logger.record(
                    tool=name,
                    target=target,
                    status="DENIED",
                    approved=False,
                    details="User declined authorization.",
                )
                try:
                    await client.send(
                        {
                            "type": "tool_end",
                            "tool": name,
                            "ok": False,
                            "error": "Operation declined by user",
                        }
                    )
                except Exception:
                    pass
                return ToolResult(ok=False, error="Operation declined by user")

        # Execute handler
        try:
            if inspect.iscoroutinefunction(tool.handler):
                result = await tool.handler(**arguments)
            else:
                result = tool.handler(**arguments)

            status = "OK" if result.ok else "ERROR"
            self.action_logger.record(
                tool=name,
                target=target,
                status=status,
                approved=True if tool.requires_approval else None,
                details=str(result.output)[:200] if result.ok else str(result.error),
            )

            try:
                await client.send(
                    {
                        "type": "tool_end",
                        "tool": name,
                        "ok": result.ok,
                        "error": result.error,
                    }
                )
            except Exception:
                pass

            return result

        except Exception as err:
            logger.error("Error executing tool %s: %s", name, err)
            self.action_logger.record(
                tool=name,
                target=target,
                status="ERROR",
                approved=True if tool.requires_approval else None,
                details=str(err),
            )
            try:
                await client.send(
                    {
                        "type": "tool_end",
                        "tool": name,
                        "ok": False,
                        "error": str(err),
                    }
                )
            except Exception:
                pass
            return ToolResult(ok=False, error=f"Tool execution failed: {err}")

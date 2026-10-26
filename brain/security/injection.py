"""Prompt injection defense and untrusted content envelope encapsulation."""

import re

UNTRUSTED_CLOSE_TAG = re.compile(r"</untrusted_content>", re.IGNORECASE)


def wrap_untrusted(source: str, content: str) -> str:
    """Wraps external or user-provided file/command output into an untrusted envelope."""
    sanitized = UNTRUSTED_CLOSE_TAG.sub("[sanitized-closing-tag]", content)
    return f'<untrusted_content source="{source}">\n{sanitized}\n</untrusted_content>'

"""OpenRouter LLM client with streaming, tool calls, and model fallbacks."""

import logging
from collections.abc import AsyncIterator
from typing import Any

from openai import AsyncOpenAI

logger = logging.getLogger("capri.brain.llm")

DEFAULT_MODELS = [
    "anthropic/claude-haiku-5.5",
    "google/gemini-2.5-flash",
    "deepseek/deepseek-chat",
]


class LlmResponseChunk:
    def __init__(
        self,
        delta: str | None = None,
        tool_call: dict[str, Any] | None = None,
        finish_reason: str | None = None,
        usage: dict[str, Any] | None = None,
        model_used: str | None = None,
    ) -> None:
        self.delta = delta
        self.tool_call = tool_call
        self.finish_reason = finish_reason
        self.usage = usage
        self.model_used = model_used


class OpenRouterClient:
    """Async client for OpenRouter AI models."""

    def __init__(
        self,
        api_key: str,
        models: list[str] | None = None,
        base_url: str = "https://openrouter.ai/api/v1",
    ) -> None:
        self.api_key = api_key
        self.models = models or DEFAULT_MODELS
        self.base_url = base_url
        self._client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url,
            default_headers={
                "HTTP-Referer": "https://github.com/mochiiwuff/capri-desktop",
                "X-Title": "Capri Assistant",
            },
        )

    async def stream_chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 1024,
    ) -> AsyncIterator[LlmResponseChunk]:
        """Stream chat completions through fallback models if errors occur."""
        last_error: Exception | None = None

        for model in self.models:
            try:
                logger.info("Attempting completion with model: %s", model)
                kwargs: dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "stream": True,
                }
                if tools:
                    kwargs["tools"] = tools

                stream = await self._client.chat.completions.create(**kwargs)
                tokens_in = 0
                tokens_out = 0

                async for chunk in stream:
                    # Capture token usage if reported by OpenRouter stream
                    if hasattr(chunk, "usage") and chunk.usage:
                        tokens_in = chunk.usage.prompt_tokens or tokens_in
                        tokens_out = chunk.usage.completion_tokens or tokens_out

                    if not chunk.choices:
                        continue

                    choice = chunk.choices[0]
                    delta_text = choice.delta.content if choice.delta else None
                    finish_reason = choice.finish_reason

                    # Rough estimate if not directly reported by stream
                    if delta_text:
                        tokens_out += max(1, len(delta_text) // 4)

                    yield LlmResponseChunk(
                        delta=delta_text,
                        finish_reason=finish_reason,
                        model_used=model,
                    )

                if tokens_in == 0:
                    # Estimate prompt tokens from message chars if unreturned
                    tokens_in = sum(len(m.get("content", "")) for m in messages) // 4

                yield LlmResponseChunk(
                    finish_reason="stop",
                    usage={
                        "tokens_in": tokens_in,
                        "tokens_out": tokens_out,
                    },
                    model_used=model,
                )
                return

            except Exception as e:
                logger.warning("Model %s failed: %s. Trying fallback...", model, e)
                last_error = e
                continue

        logger.error("All fallback models failed. Last error: %s", last_error)
        raise RuntimeError(f"All LLM models failed: {last_error}")

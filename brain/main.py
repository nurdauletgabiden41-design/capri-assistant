"""Capri Python Brain main entrypoint.

Spawns the background asyncio loop, connects to Electron over WebSocket,
authenticates with the handshake token, and processes assistant events.
"""

import argparse
import asyncio
import logging
import os
import signal
import sys
import uuid
from datetime import UTC, datetime
from typing import Any

from brain.ipc.ws_client import BrainWsClient
from brain.llm.budget import BudgetTracker, estimate_cost
from brain.llm.client import OpenRouterClient
from brain.llm.persona import build_system_prompt
from brain.memory.store import MemoryStore
from brain.security import keychain

VERSION = "0.1.0"
DEFAULT_MODEL = "anthropic/claude-haiku-5.5"

# Setup logging
log_dir = os.environ.get("CAPRI_LOG_DIR")
if not log_dir:
    app_data = os.environ.get("APPDATA", os.path.expanduser("~"))
    log_dir = os.path.join(app_data, "Capri", "logs")

os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "brain.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8", mode="a"),
    ],
)
logger = logging.getLogger("capri.brain")

# Initialize persistent memory and budget tracker
memory_store = MemoryStore()
budget_tracker = BudgetTracker(store=memory_store)
current_session_id = str(uuid.uuid4())
session_start_time = datetime.now(UTC).isoformat()


async def handle_user_text(client: BrainWsClient, text: str) -> None:
    """Process user message through persona, memory, and OpenRouter LLM."""
    clean_text = text.strip()
    if not clean_text:
        return

    # Check for direct API key input
    if clean_text.startswith("sk-or-") or (
        clean_text.lower().startswith("key ") and len(clean_text) > 20
    ):
        raw_key = clean_text.split()[-1]
        try:
            keychain.set_api_key(raw_key)
            logger.info("OpenRouter API key successfully stored in Windows Credential Manager.")
            await client.send(
                {
                    "type": "assistant_message",
                    "text": "Ключ OpenRouter надёжно сохранён в диспетчере учётных данных Windows! Готова к работе.",
                    "face": "smug",
                    "badge": "ONLINE",
                }
            )
            return
        except Exception as err:
            logger.error("Failed to store API key: %s", err)
            await client.send(
                {
                    "type": "assistant_message",
                    "text": f"Не удалось сохранить ключ: {err}",
                    "face": "aside",
                    "badge": "ERROR",
                }
            )
            return

    # Verify API key availability
    api_key = keychain.get_api_key()
    if not api_key:
        logger.warning("No OpenRouter API key found in keychain.")
        await client.send(
            {
                "type": "assistant_message",
                "text": "У меня пока нет API-ключа OpenRouter! Отправь мне ключ (начинается с sk-or-...), и я сохраню его в Windows Credential Manager.",
                "face": "aside",
                "badge": "KEY_NEEDED",
            }
        )
        return

    # Check daily budget allowance ($0.50 default)
    if not budget_tracker.is_within_budget():
        logger.warning("Daily budget exceeded for today.")
        await client.send(
            {
                "type": "assistant_message",
                "text": f"Суточный лимит расходов (${budget_tracker.daily_limit_usd:.2f}) исчерпан! Давай продолжим завтра или увеличь лимит в настройках.",
                "face": "aside",
                "badge": "BUDGET_LIMIT",
            }
        )
        return

    # Record user message in persistent memory
    memory_store.add_message(
        session_id=current_session_id,
        role="user",
        content=clean_text,
    )

    await client.send({"type": "thinking_start"})

    # Prepare context with remembered facts and message history
    facts = memory_store.get_facts()
    system_prompt = build_system_prompt(facts)
    recent_history = memory_store.get_recent_messages(session_id=current_session_id, limit=20)

    llm_messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    llm_messages.extend(recent_history)

    llm_client = OpenRouterClient(api_key=api_key)
    full_reply: list[str] = []
    tokens_in = 0
    tokens_out = 0
    model_used = DEFAULT_MODEL

    try:
        async for chunk in llm_client.stream_chat(llm_messages, max_tokens=1024):
            if chunk.delta:
                full_reply.append(chunk.delta)
                await client.send({"type": "assistant_delta", "text": chunk.delta})

            if chunk.usage:
                tokens_in = chunk.usage.get("tokens_in", 0)
                tokens_out = chunk.usage.get("tokens_out", 0)

            if chunk.model_used:
                model_used = chunk.model_used

        await client.send({"type": "thinking_end"})

        complete_text = "".join(full_reply).strip()
        if not complete_text:
            complete_text = "Готово. Системы в норме."

        # Pick appropriate face
        face = "smug"
        if "?" in complete_text:
            face = (
                "curious"
                if "curious" in ["calm", "aside", "smug", "wide", "look", "laugh", "many", "grin"]
                else "look"
            )
        elif "ошибк" in complete_text.lower():
            face = "aside"

        await client.send(
            {
                "type": "assistant_message",
                "text": complete_text,
                "face": face
                if face in ["calm", "aside", "smug", "wide", "look", "laugh", "many", "grin"]
                else "smug",
                "badge": "CAPRI",
            }
        )

        # Store reply in memory
        memory_store.add_message(
            session_id=current_session_id,
            role="assistant",
            content=complete_text,
        )

        # Track token usage and costs
        cost_usd = estimate_cost(model_used, tokens_in, tokens_out)
        memory_store.record_session(
            session_id=current_session_id,
            started_at=session_start_time,
            duration_ms=0,
            cost_usd=cost_usd,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            actions_count=0,
        )

        today = datetime.now(UTC).strftime("%Y-%m-%d")
        total_day_cost = memory_store.get_daily_cost(today)

        await client.send(
            {
                "type": "usage",
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost_usd,
                "day_cost_usd": total_day_cost,
            }
        )

    except Exception as err:
        logger.error("LLM generation failed: %s", err)
        await client.send({"type": "thinking_end"})
        await client.send(
            {
                "type": "assistant_message",
                "text": f"Сбой нейросети: {err}. Проверь соединение или статус OpenRouter.",
                "face": "aside",
                "badge": "ERROR",
            }
        )


async def handle_host_message(client: BrainWsClient, msg: dict[str, Any]) -> None:
    """Handle messages dispatched from Electron Host."""
    msg_type = msg.get("type")
    logger.info("Received message from Host: %s", msg_type)

    if msg_type == "user_text":
        text = msg.get("text", "")
        await handle_user_text(client, text)

    elif msg_type == "approval_response":
        appr_id = msg.get("id", "")
        approved = bool(msg.get("approved"))
        logger.info("Approval response received: %s -> %s", appr_id, approved)
        await client.send(
            {
                "type": "approval_resolved",
                "id": appr_id,
                "approved": approved,
            }
        )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Capri Python Brain")
    parser.add_argument("--port", type=int, default=None, help="WebSocket port of Electron Host")
    parser.add_argument("--token", type=str, default=None, help="Authentication token")
    args = parser.parse_args()

    env_port = os.environ.get("CAPRI_WS_PORT")
    port = args.port or (int(env_port) if env_port else None)
    token = args.token or os.environ.get("CAPRI_WS_TOKEN")

    if not port or not token:
        logger.error("Missing CAPRI_WS_PORT or CAPRI_WS_TOKEN. Exiting.")
        sys.exit(1)

    logger.info("Starting Capri Brain v%s on port %s...", VERSION, port)

    client = BrainWsClient(port=port, token=token)

    async def on_message_wrapper(msg: dict[str, Any]) -> None:
        await handle_host_message(client, msg)

    client.on_message = on_message_wrapper

    # Notify Host once connection is open
    async def announce_ready() -> None:
        while not client.is_connected:
            await asyncio.sleep(0.1)
        logger.info("Sending session_start...")
        await client.send(
            {
                "type": "session_start",
                "version": VERSION,
                "active_model": DEFAULT_MODEL,
            }
        )

    loop_task = asyncio.create_task(client.run())
    ready_task = asyncio.create_task(announce_ready())

    stop_event = asyncio.Event()

    def signal_handler() -> None:
        logger.info("Shutdown signal received.")
        client.stop()
        stop_event.set()

    if sys.platform != "win32":
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            loop.add_signal_handler(sig, signal_handler)

    try:
        await asyncio.gather(loop_task, ready_task)
    except asyncio.CancelledError:
        pass
    finally:
        client.stop()
        logger.info("Capri Brain terminated cleanly.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Capri Brain terminated.")

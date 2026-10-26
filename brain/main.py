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
from typing import Any

from brain.ipc.ws_client import BrainWsClient

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


async def handle_host_message(client: BrainWsClient, msg: dict[str, Any]) -> None:
    """Handle messages dispatched from Electron Host."""
    msg_type = msg.get("type")
    logger.info(f"Received message from Host: {msg_type}")

    if msg_type == "user_text":
        text = msg.get("text", "").strip()
        logger.info(f"User text received: {text}")

        # In Stage 1 skeleton, respond with an immediate acknowledge and construct greeting
        await client.send({"type": "thinking_start"})
        await asyncio.sleep(0.3)
        await client.send({"type": "thinking_end"})

        reply = f"Капри на связи! Принято: «{text}». Мозговой контур активен."
        await client.send(
            {
                "type": "assistant_message",
                "text": reply,
                "face": "smug",
                "badge": "ONLINE",
            }
        )

    elif msg_type == "approval_response":
        appr_id = msg.get("id", "")
        approved = bool(msg.get("approved"))
        logger.info(f"Approval response received: {appr_id} -> {approved}")
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

    logger.info(f"Starting Capri Brain v{VERSION} on port {port}...")

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

    # Handle termination signals
    stop_event = asyncio.Event()

    def _sig_handler() -> None:
        logger.info("Shutdown signal received.")
        client.stop()
        stop_event.set()

    if sys.platform != "win32":
        for s in (signal.SIGINT, signal.SIGTERM):
            asyncio.get_running_loop().add_signal_handler(s, _sig_handler)

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
    except KeyboardInterrupt:
        pass

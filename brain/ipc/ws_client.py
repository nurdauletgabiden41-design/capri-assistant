"""Async WebSocket client linking Python Brain to Electron Host."""

import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from typing import Any

from websockets.asyncio.client import ClientConnection, connect
from websockets.protocol import State

from brain.ipc.protocol import deserialize_message, serialize_message

logger = logging.getLogger("capri.brain.ws")


class BrainWsClient:
    """Manages the authenticated WebSocket connection from Python Brain to Electron."""

    def __init__(
        self,
        port: int,
        token: str,
        on_message: Callable[[dict[str, Any]], Coroutine[Any, Any, None]] | None = None,
    ):
        self.port = port
        self.token = token
        self.on_message = on_message
        self.ws: ClientConnection | None = None
        self._running = False
        self._send_queue: asyncio.Queue[str] = asyncio.Queue()

    @property
    def is_connected(self) -> bool:
        return self.ws is not None and self.ws.state is State.OPEN

    async def send(self, msg: dict[str, Any]) -> None:
        """Enqueue a message to be sent to Electron Host."""
        payload = serialize_message(msg)
        await self._send_queue.put(payload)

    async def run(self) -> None:
        """Run the connection loop with handshake and heartbeat."""
        self._running = True
        uri = f"ws://127.0.0.1:{self.port}"
        logger.info(f"Connecting to Capri Electron Host at {uri}...")

        while self._running:
            try:
                async with connect(
                    uri,
                    ping_interval=None,  # We handle protocol-level ping/pong
                    close_timeout=5,
                ) as ws:
                    self.ws = ws
                    logger.info("Connected to WebSocket server. Sending handshake...")

                    # 1. Send authentication handshake immediately
                    handshake = {"type": "handshake", "token": self.token}
                    await ws.send(json.dumps(handshake))

                    # 2. Start sender task and message receiver
                    send_task = asyncio.create_task(self._sender_loop(ws))
                    try:
                        async for raw_message in ws:
                            await self._handle_raw(raw_message)
                    finally:
                        send_task.cancel()
                        await asyncio.gather(send_task, return_exceptions=True)

            except (ConnectionRefusedError, OSError) as e:
                logger.warning(f"Connection failed or lost ({e}). Retrying in 2 seconds...")
                self.ws = None
                if not self._running:
                    break
                await asyncio.sleep(2)
            except Exception:
                logger.exception("Unexpected WS error")
                self.ws = None
                if not self._running:
                    break
                await asyncio.sleep(2)

    async def _sender_loop(self, ws: ClientConnection) -> None:
        """Pulls messages from the send queue and writes them to the socket."""
        while True:
            payload = await self._send_queue.get()
            try:
                await ws.send(payload)
            finally:
                self._send_queue.task_done()

    async def _handle_raw(self, raw: str) -> None:
        """Processes an incoming raw text frame from Host."""
        try:
            msg = deserialize_message(raw)
        except Exception as err:
            logger.error(f"Protocol deserialization error: {err} | Raw: {raw[:200]}")
            return

        msg_type = msg.get("type")

        # Built-in ping handling
        if msg_type == "ping":
            await self.send({"type": "pong", "timestamp": msg.get("timestamp")})
            return

        if self.on_message:
            try:
                await self.on_message(msg)
            except Exception:
                logger.exception(f"Error in on_message callback for {msg_type}")

    def stop(self) -> None:
        """Signal client to stop running and disconnect."""
        self._running = False
        if self.ws and self.ws.state is State.OPEN:
            asyncio.create_task(self.ws.close())

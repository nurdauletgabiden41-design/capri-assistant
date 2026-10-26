"""Integration tests for BrainWsClient and message flow."""

import asyncio
import json

import pytest
from websockets.asyncio.server import serve

from brain.ipc.ws_client import BrainWsClient


@pytest.mark.asyncio
async def test_brain_client_handshake_and_echo():
    """Verify BrainWsClient connects to a server, sends handshake, and receives/sends messages."""
    received_handshake = None
    server_received_messages = []
    test_token = "b" * 32

    async def server_handler(ws):
        nonlocal received_handshake
        async for raw in ws:
            data = json.loads(raw)
            if not received_handshake:
                received_handshake = data
                # Send a ping and user_text once authenticated
                await ws.send(json.dumps({"type": "ping", "timestamp": 1000}))
                await ws.send(json.dumps({"type": "user_text", "text": "Test Integration"}))
            else:
                server_received_messages.append(data)

    server = await serve(server_handler, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]

    client_received_messages = []

    async def on_client_message(msg):
        client_received_messages.append(msg)
        if msg.get("type") == "user_text":
            # Echo reply
            await client.send({"type": "assistant_message", "text": "OK", "face": "smug"})

    client = BrainWsClient(port=port, token=test_token, on_message=on_client_message)
    client_task = asyncio.create_task(client.run())

    # Wait for exchange to complete
    for _ in range(50):
        if len(server_received_messages) >= 2:  # pong + assistant_message
            break
        await asyncio.sleep(0.1)

    client.stop()
    await asyncio.gather(client_task, return_exceptions=True)
    server.close()
    await server.wait_closed()

    # Assertions
    assert received_handshake is not None
    assert received_handshake["type"] == "handshake"
    assert received_handshake["token"] == test_token

    msg_types = [m.get("type") for m in server_received_messages]
    assert "pong" in msg_types
    assert "assistant_message" in msg_types

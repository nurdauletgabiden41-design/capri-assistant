"""Host approval gate managing explicit human authorization requests."""

import asyncio
import logging
import uuid
from typing import Any

logger = logging.getLogger("capri.brain.approval")


class HostApprovalGate:
    """Coordinates authorization requests between Python Brain and Electron Host."""

    def __init__(self, default_timeout: float = 120.0) -> None:
        self.default_timeout = default_timeout
        self._pending: dict[str, asyncio.Future[bool]] = {}

    @property
    def has_pending(self) -> bool:
        return len(self._pending) > 0

    async def request_approval(
        self,
        client: Any,
        kind: str,
        summary: str,
        details: str,
        diff: str | None = None,
        timeout: float | None = None,
    ) -> bool:
        """Sends needs_approval to Host and pauses until user approves or declines."""
        appr_id = f"appr-{uuid.uuid4().hex[:8]}"
        loop = asyncio.get_running_loop()
        future: asyncio.Future[bool] = loop.create_future()
        self._pending[appr_id] = future

        msg: dict[str, Any] = {
            "type": "needs_approval",
            "id": appr_id,
            "kind": kind,
            "summary": summary,
            "details": details,
        }
        if diff:
            msg["diff"] = diff

        logger.info("Emitting needs_approval [%s] for %s: %s", appr_id, kind, summary)
        try:
            await client.send(msg)
        except Exception as err:
            logger.error("Failed to send needs_approval event: %s", err)
            self._pending.pop(appr_id, None)
            return False

        effective_timeout = timeout or self.default_timeout
        try:
            approved = await asyncio.wait_for(future, timeout=effective_timeout)
            logger.info("Approval [%s] resolved by user: %s", appr_id, approved)
            return approved
        except TimeoutError:
            logger.warning("Approval [%s] timed out after %s seconds", appr_id, effective_timeout)
            return False
        finally:
            self._pending.pop(appr_id, None)

    def resolve_approval(self, appr_id: str, approved: bool) -> bool:
        """Resolves a pending approval future when host transmits approval_response."""
        if appr_id not in self._pending:
            logger.warning("Received approval_response for unknown/expired id: %s", appr_id)
            return False

        fut = self._pending[appr_id]
        if not fut.done():
            fut.set_result(approved)
            return True
        return False

    def cancel_all(self) -> None:
        """Cancels all outstanding approval requests with False (e.g. on abort/disconnect)."""
        for appr_id, fut in list(self._pending.items()):
            if not fut.done():
                fut.set_result(False)
        self._pending.clear()

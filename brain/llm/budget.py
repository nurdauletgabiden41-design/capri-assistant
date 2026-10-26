"""Token usage calculation and daily budget enforcement."""

from datetime import UTC, datetime

from brain.memory.store import MemoryStore

# Approximate costs per 1,000,000 tokens (USD)
MODEL_PRICING: dict[str, dict[str, float]] = {
    "anthropic/claude-haiku-5.5": {"input": 0.80, "output": 4.00},
    "anthropic/claude-3-5-haiku": {"input": 0.80, "output": 4.00},
    "google/gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "deepseek/deepseek-chat": {"input": 0.14, "output": 0.28},
}

DEFAULT_PRICING = {"input": 1.00, "output": 3.00}
DEFAULT_DAILY_BUDGET_USD = 0.50


def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Calculate approximate cost in USD for a given token usage."""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    cost_in = (tokens_in / 1_000_000.0) * pricing["input"]
    cost_out = (tokens_out / 1_000_000.0) * pricing["output"]
    return round(cost_in + cost_out, 6)


class BudgetTracker:
    """Monitors cumulative token spend against the configured daily ceiling."""

    def __init__(
        self,
        daily_limit_usd: float = DEFAULT_DAILY_BUDGET_USD,
        store: MemoryStore | None = None,
    ) -> None:
        self.daily_limit_usd = daily_limit_usd
        self.store = store or MemoryStore()

    def is_within_budget(self, additional_cost: float = 0.0) -> bool:
        """Check if today's cumulative spend + additional_cost is within limits."""
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        current_spend = self.store.get_daily_cost(today)
        return (current_spend + additional_cost) <= self.daily_limit_usd

    def get_remaining_budget(self) -> float:
        """Get remaining USD allowance for today."""
        today = datetime.now(UTC).strftime("%Y-%m-%d")
        spent = self.store.get_daily_cost(today)
        return max(0.0, self.daily_limit_usd - spent)

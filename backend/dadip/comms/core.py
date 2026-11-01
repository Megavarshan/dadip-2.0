"""Communication engine core: pure functions, no I/O, time and randomness injected.

The live dispatcher (`dadip.comms.dispatcher`, PostgreSQL outbox) and the network simulator
(`dadip.simulation`) both call these functions, so experimental results describe the code that ships.

Three strategies are compared in the research:

| Strategy  | Order               | Retry | Dedup | Persist across outage | TTL |
| --------- | ------------------- | ----- | ----- | --------------------- | --- |
| baseline  | arrival (FIFO)      | no    | no    | no (dropped)          | no  |
| priority  | priority, then FIFO | no    | no    | no (dropped)          | no  |
| resilient | priority, deadline  | yes   | yes   | yes (outbox)          | yes |
"""

import hashlib
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import StrEnum


class State(StrEnum):
    queued = "queued"
    dispatching = "dispatching"
    retry_scheduled = "retry_scheduled"
    delivered = "delivered"
    acknowledged = "acknowledged"
    failed = "failed"
    expired = "expired"
    duplicate_suppressed = "duplicate_suppressed"
    cancelled = "cancelled"


TERMINAL = {State.delivered, State.acknowledged, State.failed, State.expired, State.duplicate_suppressed,
            State.cancelled}
READY = {State.queued, State.retry_scheduled}


class Outcome(StrEnum):
    success = "success"
    transient_error = "transient_error"   # worth retrying: timeout, 5xx, broker unreachable, rate limited
    permanent_error = "permanent_error"   # not worth retrying: 4xx, invalid recipient
    timeout = "timeout"


LEVEL_PRIORITY = {"red": 90, "orange": 70, "yellow": 50, "green": 30}


def priority_for(level: str, composite_risk: int | None = None) -> int:
    """0-100, higher first. The alert level sets the band; composite risk breaks ties inside it (+0..9)."""
    base = LEVEL_PRIORITY.get(level, 30)
    bump = min(9, max(0, (composite_risk or 0) // 11))
    return min(100, base + bump)


def idempotency_key(*parts: object) -> str:
    """Stable key for 'the same alert, on the same channel, to the same recipient'."""
    return hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()[:64]


@dataclass(frozen=True)
class RetryPolicy:
    base_s: float = 2.0
    factor: float = 2.0
    max_delay_s: float = 120.0
    max_attempts: int = 6

    def delay(self, attempt: int, rng: random.Random) -> float:
        """'Full jitter' exponential backoff: uniform(0, min(cap, base * factor^(attempt-1))).
        Jitter spreads retries so a recovering channel is not hit by every queued message at once."""
        ceiling = min(self.max_delay_s, self.base_s * self.factor ** max(0, attempt - 1))
        return rng.uniform(0, ceiling)


@dataclass(frozen=True)
class StrategyConfig:
    name: str
    prioritize: bool
    retry: bool
    dedup: bool
    persist_on_outage: bool
    enforce_ttl: bool
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)


BASELINE = StrategyConfig("baseline", prioritize=False, retry=False, dedup=False, persist_on_outage=False,
                          enforce_ttl=False)
PRIORITY = StrategyConfig("priority", prioritize=True, retry=False, dedup=False, persist_on_outage=False,
                          enforce_ttl=False)
RESILIENT = StrategyConfig("resilient", prioritize=True, retry=True, dedup=True, persist_on_outage=True,
                           enforce_ttl=True)
STRATEGIES = {s.name: s for s in (BASELINE, PRIORITY, RESILIENT)}


@dataclass
class Envelope:
    """The scheduling view of a message, shared by the dispatcher and the simulator."""

    id: str
    priority: int
    created_at: datetime
    expires_at: datetime
    idempotency_key: str
    state: State = State.queued
    attempts: int = 0
    next_attempt_at: datetime | None = None


def sort_key(e: Envelope, cfg: StrategyConfig) -> tuple:
    if not cfg.prioritize:
        return (e.created_at, e.id)
    # Higher priority first; within a band, the message closest to expiry first; then oldest.
    return (-e.priority, e.expires_at, e.created_at, e.id)


def select_ready(queue: list[Envelope], now: datetime, cfg: StrategyConfig, limit: int) -> list[Envelope]:
    ready = [e for e in queue if e.state in READY and (e.next_attempt_at is None or e.next_attempt_at <= now)]
    ready.sort(key=lambda e: sort_key(e, cfg))
    return ready[:limit]


def is_expired(e: Envelope, now: datetime, cfg: StrategyConfig) -> bool:
    return cfg.enforce_ttl and now >= e.expires_at


@dataclass(frozen=True)
class Transition:
    state: State
    next_attempt_at: datetime | None
    reason: str


def after_attempt(e: Envelope, outcome: Outcome, now: datetime, cfg: StrategyConfig, rng: random.Random,
                  max_attempts: int | None = None) -> Transition:
    """Decide what happens to a message after one delivery attempt (attempt count already incremented)."""
    if outcome == Outcome.success:
        return Transition(State.delivered, None, "delivered")
    limit = max_attempts or cfg.retry_policy.max_attempts
    if outcome == Outcome.permanent_error:
        return Transition(State.failed, None, "permanent error")
    if not cfg.retry:
        return Transition(State.failed, None, f"{outcome.value}; strategy '{cfg.name}' does not retry")
    if e.attempts >= limit:
        return Transition(State.failed, None, f"gave up after {e.attempts} attempts")
    when = now + timedelta(seconds=cfg.retry_policy.delay(e.attempts, rng))
    if cfg.enforce_ttl and when >= e.expires_at:
        return Transition(State.expired, None, "next retry would be after expiry")
    return Transition(State.retry_scheduled, when, f"{outcome.value}; retry {e.attempts + 1} scheduled")


def on_channel_outage(e: Envelope, now: datetime, cfg: StrategyConfig) -> Transition:
    """The channel is known to be down before an attempt is made."""
    if cfg.persist_on_outage:
        return Transition(State.queued, now, "held in outbox until the channel recovers")
    return Transition(State.failed, None, "channel down; message dropped")

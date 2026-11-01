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
                  max_attempts: int | None = None, channel_down: bool = False) -> Transition:
    """Decide what happens to a message after one delivery attempt (attempt count already incremented).

    `channel_down`: the availability monitor (circuit breaker) considers the channel down. With a strategy that
    persists on outage, such a failure says nothing about the message, so it returns to the outbox and its retry
    budget is refunded by the caller (`refund_attempt`). Without this, the breaker's probes, which always use the
    highest-priority message, exhausted the retry budget of red alerts during long outages (found in the
    `outage` experiment)."""
    if outcome == Outcome.success:
        return Transition(State.delivered, None, "delivered")
    if channel_down and cfg.persist_on_outage and outcome != Outcome.permanent_error:
        if cfg.enforce_ttl and now >= e.expires_at:
            return Transition(State.expired, None, "expired while the channel was down")
        return Transition(State.queued, now, "channel down; held in outbox, retry budget not consumed")
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


def refund_attempt(t: Transition) -> bool:
    """True when the attempt that led to `t` must not count against the message's retry budget."""
    return t.state == State.queued


def on_channel_outage(e: Envelope, now: datetime, cfg: StrategyConfig) -> Transition:
    """The channel is known to be down before an attempt is made."""
    if cfg.persist_on_outage:
        return Transition(State.queued, now, "held in outbox until the channel recovers")
    return Transition(State.failed, None, "channel down; message dropped")


@dataclass
class CircuitBreaker:
    """Channel availability monitor. After `threshold` consecutive transient failures the channel is treated as
    down: messages stay queued (no attempts burn their retry budget) and one probe is allowed every
    `probe_interval_s`. A successful attempt closes the breaker."""

    threshold: int = 3
    probe_interval_s: float = 5.0
    consecutive_failures: int = 0
    open_since: float | None = None
    last_probe: float | None = None

    def allow(self, now_s: float) -> bool:
        if self.open_since is None:
            return True
        # Tolerance: last_probe + interval - last_probe can be 4.999999999 in floating point; without it a caller
        # that wakes exactly at last_probe + interval is refused forever (found by the simulator hanging).
        if self.last_probe is None or now_s - self.last_probe >= self.probe_interval_s - 1e-9:
            self.last_probe = now_s
            return True
        return False

    def record(self, success: bool, now_s: float) -> None:
        if success:
            self.consecutive_failures, self.open_since, self.last_probe = 0, None, None
            return
        self.consecutive_failures += 1
        if self.consecutive_failures >= self.threshold and self.open_since is None:
            self.open_since = now_s
            self.last_probe = now_s

    @property
    def is_open(self) -> bool:
        return self.open_since is not None

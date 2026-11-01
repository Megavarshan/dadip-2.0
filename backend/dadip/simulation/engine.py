"""Seeded discrete-event simulator of alert dispatch over a degraded channel.

The scheduling decisions (which message next, what happens after an attempt, TTL, outage handling) are the
functions in `dadip.comms.core`, the same code the live PostgreSQL dispatcher runs. The simulator supplies
time, arrivals and a channel model.

Channel model (one logical channel, e.g. a regional SMS gateway or MQTT uplink):
- capacity: a single sender serialises attempts at `capacity_per_s`; each attempt holds the sender 1/capacity s
- propagation: one-way latency ~ latency_s * LogNormal(0, latency_sigma)
- loss: each direction is lost independently with probability `loss`; a lost send or a lost acknowledgement
  looks the same to the sender (timeout after `timeout_s`)
- outages: during an outage window every attempt fails (timeout)

Receiver model: a message counts as delivered when the payload reaches the receiver. With the resilient
strategy receivers deduplicate by idempotency key (as the edge inbox does), so re-sends caused by lost acks are
not shown to users twice; baseline and priority receivers show every copy.

This is a software model. It does not reproduce cellular, satellite, 5G or mesh radio behaviour.
"""

import heapq
import itertools
import math
import random
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime, timedelta

from dadip.comms import core
from dadip.comms.core import CircuitBreaker, Envelope, Outcome, State, StrategyConfig

T0 = datetime(2026, 1, 1, tzinfo=UTC)
LEVELS = ("red", "orange", "yellow", "green")


@dataclass(frozen=True)
class Scenario:
    name: str
    arrival_rate_per_s: float = 2.0
    duration_s: float = 600.0
    capacity_per_s: float = 10.0
    latency_s: float = 0.15
    latency_sigma: float = 0.4
    loss: float = 0.01
    timeout_s: float = 5.0
    outages: tuple[tuple[float, float], ...] = ()
    priority_mix: tuple[float, float, float, float] = (0.10, 0.20, 0.30, 0.40)  # red, orange, yellow, green
    ttl_s: tuple[float, float, float, float] = (300.0, 600.0, 900.0, 1200.0)
    duplicate_submission_rate: float = 0.05
    drain_s: float = 1500.0  # keep simulating after arrivals stop, so queued work can finish or expire


SCENARIOS = {
    s.name: s for s in (
        Scenario("normal"),
        Scenario("high_latency", latency_s=2.0, latency_sigma=0.5, timeout_s=10.0),
        Scenario("packet_loss", loss=0.20),
        Scenario("congestion", arrival_rate_per_s=8.0, capacity_per_s=5.0),
        Scenario("outage", outages=((200.0, 320.0),)),
        Scenario("outage_lossy_recovery", loss=0.10, outages=((200.0, 320.0),)),
        Scenario("load_x4", arrival_rate_per_s=8.0, capacity_per_s=10.0, loss=0.05),
    )
}


@dataclass
class SimMessage:
    env: Envelope
    level: str
    arrival_s: float
    key: str
    first_attempt_s: float | None = None
    delivered_s: float | None = None
    copies_at_receiver: int = 0
    wire_sends: int = 0
    terminal_s: float | None = None


@dataclass
class RunResult:
    scenario: str
    strategy: str
    seed: int
    metrics: dict
    config: dict = field(default_factory=dict)


def _t(s: float) -> datetime:
    return T0 + timedelta(seconds=s)


def _s(t: datetime) -> float:
    return (t - T0).total_seconds()


def _pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    v = sorted(values)
    k = (len(v) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def _in_outage(sc: Scenario, t: float) -> bool:
    return any(a <= t < b for a, b in sc.outages)


def run(sc: Scenario, cfg: StrategyConfig, seed: int) -> RunResult:
    wall0 = time.perf_counter()
    # Independent streams so that, for a given seed, every strategy sees the same arrivals and the same channel
    # randomness for its n-th attempt (common random numbers reduce variance between strategies).
    arr_rng = random.Random(f"{seed}:arrivals")
    chan_rng = random.Random(f"{seed}:channel")
    retry_rng = random.Random(f"{seed}:retry")
    ids = itertools.count()

    # ---- arrivals (identical for every strategy under the same seed) ----
    arrivals: list[tuple[float, str, str]] = []  # (time, level, key)
    t = 0.0
    while True:
        t += arr_rng.expovariate(sc.arrival_rate_per_s)
        if t >= sc.duration_s:
            break
        level = arr_rng.choices(LEVELS, weights=sc.priority_mix)[0]
        key = f"k{next(ids)}"
        arrivals.append((t, level, key))
        if arr_rng.random() < sc.duplicate_submission_rate:
            arrivals.append((t + arr_rng.uniform(0.5, 10.0), level, key))  # a second operator / source
    arrivals.sort()

    events: list[tuple[float, int, str, object]] = []
    seq = itertools.count()

    def push(at: float, kind: str, data: object = None) -> None:
        heapq.heappush(events, (at, next(seq), kind, data))

    for a in arrivals:
        push(a[0], "arrival", a)

    queue: list[Envelope] = []
    msgs: dict[str, SimMessage] = {}
    seen_keys: set[str] = set()
    suppressed = 0
    breaker = CircuitBreaker() if cfg.persist_on_outage else None
    busy_until = 0.0
    wake_scheduled: set[float] = set()
    attempts_total = 0
    end = sc.duration_s + sc.drain_s
    queue_samples: list[tuple[float, int]] = []

    def finish(m: SimMessage, state: State, now: float) -> None:
        m.env.state = state
        m.terminal_s = now
        if m.env in queue:
            queue.remove(m.env)

    def try_dispatch(now: float) -> None:
        nonlocal busy_until, attempts_total
        if now < busy_until:
            return
        if cfg.enforce_ttl:
            for e in [e for e in queue if core.is_expired(e, _t(now), cfg)]:
                finish(msgs[e.id], State.expired, now)
        ready = core.select_ready(queue, _t(now), cfg, 1)
        if not ready:
            pending = [e.next_attempt_at for e in queue if e.state in core.READY and e.next_attempt_at]
            if pending:
                nxt = max(_s(min(pending)), now + 1e-6)
                if nxt not in wake_scheduled:
                    wake_scheduled.add(nxt)
                    push(nxt, "wake")
            return
        if breaker is not None and not breaker.allow(now):
            nxt = max((breaker.last_probe or now) + breaker.probe_interval_s, now + 1e-6)  # time must advance
            if nxt not in wake_scheduled:
                wake_scheduled.add(nxt)
                push(nxt, "wake")
            return
        e = ready[0]
        m = msgs[e.id]
        e.state = State.dispatching
        e.attempts += 1
        attempts_total += 1
        m.first_attempt_s = m.first_attempt_s if m.first_attempt_s is not None else now
        service = 1.0 / sc.capacity_per_s
        busy_until = now + service
        push(busy_until, "free")

        down = _in_outage(sc, now)
        send_ok = (not down) and chan_rng.random() >= sc.loss
        ack_ok = send_ok and (not _in_outage(sc, now + service)) and chan_rng.random() >= sc.loss
        one_way = sc.latency_s * chan_rng.lognormvariate(0, sc.latency_sigma)
        if send_ok:
            m.wire_sends += 1
            push(now + service + one_way, "receive", e.id)
        if ack_ok:
            push(now + service + 2 * one_way, "result", (e.id, Outcome.success))
        else:
            push(now + service + sc.timeout_s, "result", (e.id, Outcome.timeout))

    while events:
        now, _, kind, data = heapq.heappop(events)
        if now > end:
            break
        wake_scheduled.discard(now)
        if kind == "arrival":
            at, level, key = data
            if cfg.dedup and key in seen_keys:
                suppressed += 1
            else:
                seen_keys.add(key)
                mid = f"m{next(ids)}"
                lvl_idx = LEVELS.index(level)
                env = Envelope(id=mid, priority=core.priority_for(level), created_at=_t(at),
                               expires_at=_t(at + sc.ttl_s[lvl_idx]), idempotency_key=key, next_attempt_at=_t(at))
                msgs[mid] = SimMessage(env=env, level=level, arrival_s=at, key=key)
                queue.append(env)
        elif kind == "receive":
            m = msgs[data]
            m.copies_at_receiver += 1
            if m.delivered_s is None:
                m.delivered_s = now
        elif kind == "result":
            mid, outcome = data
            m = msgs[mid]
            if m.env.state != State.dispatching:
                pass  # message already terminal (e.g. expired while the attempt was in flight)
            else:
                if breaker is not None:
                    breaker.record(outcome == Outcome.success, now)
                down = breaker is not None and breaker.is_open
                tr = core.after_attempt(m.env, outcome, _t(now), cfg, retry_rng, channel_down=down)
                if core.refund_attempt(tr):
                    m.env.attempts -= 1  # attempts_total still counts the physical attempt
                if tr.state in core.TERMINAL:
                    finish(m, tr.state, now)
                else:
                    m.env.state = tr.state
                    m.env.next_attempt_at = tr.next_attempt_at
        queue_samples.append((now, len(queue)))
        try_dispatch(now)

    for m in msgs.values():
        if m.terminal_s is None:
            m.terminal_s = end
            if m.env.state not in core.TERMINAL:
                m.env.state = State.failed if not cfg.enforce_ttl else State.expired

    metrics = _metrics(sc, cfg, list(msgs.values()), suppressed, attempts_total, queue_samples)
    metrics["sim_wall_ms"] = round((time.perf_counter() - wall0) * 1000, 1)
    return RunResult(sc.name, cfg.name, seed, metrics, {"scenario": asdict(sc), "strategy": cfg.name,
                                                         "retry_policy": asdict(cfg.retry_policy)})


def _metrics(sc: Scenario, cfg: StrategyConfig, ms: list[SimMessage], suppressed: int, attempts: int,
             queue_samples: list[tuple[float, int]]) -> dict:
    def timely(m: SimMessage) -> bool:
        return m.delivered_s is not None and m.delivered_s <= _s(m.env.expires_at)

    # Everything is measured per unique alert (idempotency key), so duplicate submissions do not change the
    # denominator for strategies that do not deduplicate. An alert counts as delivered at its first timely copy.
    by_key: dict[str, list[SimMessage]] = {}
    for m in ms:
        by_key.setdefault(m.key, []).append(m)
    first_arrival = {k: min(m.arrival_s for m in v) for k, v in by_key.items()}
    level_of = {k: v[0].level for k, v in by_key.items()}
    first_ok: dict[str, float] = {}
    for k, v in by_key.items():
        times = [m.delivered_s for m in v if timely(m)]
        if times:
            first_ok[k] = min(times)
    out: dict = {"alerts": len(by_key), "messages": len(ms), "duplicate_submissions_suppressed": suppressed}
    out["delivery_ratio"] = len(first_ok) / len(by_key) if by_key else None
    out["stale_deliveries"] = sum(1 for m in ms if m.delivered_s is not None and not timely(m))
    lat = [first_ok[k] - first_arrival[k] for k in first_ok]
    out["latency_p50_s"] = _pct(lat, 0.5)
    out["latency_p95_s"] = _pct(lat, 0.95)
    out["latency_mean_s"] = sum(lat) / len(lat) if lat else None
    for level in LEVELS:
        keys = [k for k in by_key if level_of[k] == level]
        ok = [k for k in keys if k in first_ok]
        out[f"{level}_delivery_ratio"] = len(ok) / len(keys) if keys else None
        out[f"{level}_latency_p95_s"] = _pct([first_ok[k] - first_arrival[k] for k in ok], 0.95)
    delivered = list(first_ok)
    waits = [m.first_attempt_s - m.arrival_s for m in ms if m.first_attempt_s is not None]
    out["queue_wait_mean_s"] = sum(waits) / len(waits) if waits else None
    out["queue_wait_p95_s"] = _pct(waits, 0.95)
    out["throughput_per_s"] = len(delivered) / sc.duration_s
    # User-visible duplicates: resilient receivers dedup by key, others show every copy.
    # Each duplicate submission that was not suppressed also reaches users as a separate message.
    if cfg.dedup:
        user_dups = 0
    else:
        keys: dict[str, int] = {}
        for m in ms:
            if m.delivered_s is not None:
                keys[m.key] = keys.get(m.key, 0) + 1
        user_dups = sum(c - 1 for c in keys.values()) + sum(max(0, m.copies_at_receiver - 1) for m in ms)
    unique_delivered = len({m.key for m in ms if m.delivered_s is not None})
    out["duplicate_delivery_rate"] = user_dups / unique_delivered if unique_delivered else None
    out["wire_resends_received"] = sum(max(0, m.copies_at_receiver - 1) for m in ms)
    out["attempts_total"] = attempts
    out["attempts_per_delivered"] = attempts / len(delivered) if delivered else None
    out["expired"] = sum(1 for m in ms if m.env.state == State.expired)
    out["failed"] = sum(1 for m in ms if m.env.state == State.failed and m.delivered_s is None)
    out.update(_recovery(sc, ms, queue_samples))
    return out


def _recovery(sc: Scenario, ms: list[SimMessage], samples: list[tuple[float, int]]) -> dict:
    """For the first outage: time from restoration until (a) the first new delivery and (b) the queue backlog
    returns to its pre-outage level. None when the scenario has no outage or the backlog never drains."""
    if not sc.outages:
        return {"recovery_first_delivery_s": None, "recovery_backlog_drain_s": None, "backlog_at_restore": None}
    start, stop = sc.outages[0]
    before = [q for t, q in samples if start - 30 <= t < start]
    baseline_q = max(before) if before else 0
    at_restore = next((q for t, q in samples if t >= stop), None)
    first = min((m.delivered_s for m in ms if m.delivered_s and m.delivered_s >= stop), default=None)
    drain = next((t for t, q in samples if t >= stop and q <= baseline_q), None)
    return {"recovery_first_delivery_s": first - stop if first is not None else None,
            "recovery_backlog_drain_s": drain - stop if drain is not None else None,
            "backlog_at_restore": at_restore}

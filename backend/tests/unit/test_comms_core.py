import random
from datetime import UTC, datetime, timedelta

from dadip.comms.core import (
    BASELINE,
    PRIORITY,
    RESILIENT,
    Envelope,
    Outcome,
    RetryPolicy,
    State,
    after_attempt,
    idempotency_key,
    is_expired,
    on_channel_outage,
    priority_for,
    select_ready,
)

T0 = datetime(2026, 11, 1, 12, tzinfo=UTC)


def env(id_, prio, created_s=0, ttl_s=600, **kw):
    return Envelope(id=id_, priority=prio, created_at=T0 + timedelta(seconds=created_s),
                    expires_at=T0 + timedelta(seconds=ttl_s), idempotency_key=id_, **kw)


def test_priority_bands_and_tiebreak():
    assert priority_for("red", 100) > priority_for("red", 0) > priority_for("orange", 100) > priority_for("yellow")
    assert 0 <= priority_for("green", 0) and priority_for("red", 100) <= 100


def test_baseline_is_fifo_priority_is_not():
    q = [env("low-old", 30, 0), env("high-new", 90, 5)]
    assert [e.id for e in select_ready(q, T0 + timedelta(seconds=10), BASELINE, 2)] == ["low-old", "high-new"]
    assert [e.id for e in select_ready(q, T0 + timedelta(seconds=10), PRIORITY, 2)] == ["high-new", "low-old"]


def test_same_priority_closest_deadline_first():
    q = [env("late", 90, 0, ttl_s=900), env("soon", 90, 1, ttl_s=60)]
    assert select_ready(q, T0 + timedelta(seconds=2), RESILIENT, 1)[0].id == "soon"


def test_not_ready_until_retry_time():
    e = env("a", 50, state=State.retry_scheduled, next_attempt_at=T0 + timedelta(seconds=30))
    assert select_ready([e], T0 + timedelta(seconds=10), RESILIENT, 5) == []
    assert select_ready([e], T0 + timedelta(seconds=30), RESILIENT, 5) == [e]


def test_backoff_is_bounded_and_grows():
    p = RetryPolicy(base_s=1, factor=2, max_delay_s=10)
    rng = random.Random(1)
    for attempt, ceiling in [(1, 1), (2, 2), (3, 4), (4, 8), (5, 10), (9, 10)]:
        samples = [p.delay(attempt, rng) for _ in range(500)]
        assert 0 <= min(samples) and max(samples) <= ceiling
        assert max(samples) > ceiling * 0.8  # full jitter actually uses the range


def test_transitions_by_strategy():
    rng = random.Random(0)
    e = env("a", 50, attempts=1)
    assert after_attempt(e, Outcome.success, T0, BASELINE, rng).state == State.delivered
    assert after_attempt(e, Outcome.transient_error, T0, BASELINE, rng).state == State.failed
    assert after_attempt(e, Outcome.transient_error, T0, PRIORITY, rng).state == State.failed
    t = after_attempt(e, Outcome.transient_error, T0, RESILIENT, rng)
    assert t.state == State.retry_scheduled and t.next_attempt_at > T0
    assert after_attempt(e, Outcome.permanent_error, T0, RESILIENT, rng).state == State.failed


def test_resilient_gives_up_after_max_attempts():
    e = env("a", 50, attempts=RESILIENT.retry_policy.max_attempts)
    assert after_attempt(e, Outcome.timeout, T0, RESILIENT, random.Random(0)).state == State.failed


def test_resilient_expires_instead_of_retrying_late():
    e = env("a", 50, ttl_s=1, attempts=3)  # next backoff can exceed 1 s
    states = {after_attempt(e, Outcome.timeout, T0, RESILIENT, random.Random(s)).state for s in range(50)}
    assert State.expired in states and State.delivered not in states


def test_ttl_only_enforced_by_resilient():
    e = env("a", 50, ttl_s=10)
    later = T0 + timedelta(seconds=11)
    assert is_expired(e, later, RESILIENT) and not is_expired(e, later, BASELINE)


def test_outage_handling():
    e = env("a", 90)
    assert on_channel_outage(e, T0, BASELINE).state == State.failed
    assert on_channel_outage(e, T0, RESILIENT).state == State.queued


def test_idempotency_key_stable():
    assert idempotency_key("alert", "sms", "+91") == idempotency_key("alert", "sms", "+91")
    assert idempotency_key("alert", "sms", "+91") != idempotency_key("alert", "sms", "+92")


def test_circuit_breaker_opens_probes_and_closes():
    from dadip.comms.core import CircuitBreaker

    cb = CircuitBreaker(threshold=3, probe_interval_s=5)
    for t in range(3):
        assert cb.allow(t)
        cb.record(False, t)
    assert cb.is_open
    assert not cb.allow(3) and not cb.allow(6.9)
    assert cb.allow(7.1)          # one probe after the interval
    assert not cb.allow(7.2)
    cb.record(True, 7.5)
    assert not cb.is_open and cb.allow(7.6)


def test_failures_while_channel_down_do_not_consume_retry_budget():
    from dadip.comms.core import refund_attempt

    e = env("red", 90, attempts=RESILIENT.retry_policy.max_attempts)
    t = after_attempt(e, Outcome.timeout, T0, RESILIENT, random.Random(0), channel_down=True)
    assert t.state == State.queued and refund_attempt(t)
    # without persistence (baseline) a down channel still loses the message
    assert after_attempt(e, Outcome.timeout, T0, BASELINE, random.Random(0), channel_down=True).state == State.failed
    # TTL still wins
    late = env("old", 90, ttl_s=1)
    assert after_attempt(late, Outcome.timeout, T0 + timedelta(seconds=2), RESILIENT, random.Random(0),
                         channel_down=True).state == State.expired


def test_circuit_breaker_allows_probe_at_exact_float_boundary():
    from dadip.comms.core import CircuitBreaker

    cb = CircuitBreaker(threshold=1, probe_interval_s=5.0)
    cb.record(False, 208.35826771)   # opens, last_probe = that time
    assert cb.allow(208.35826771 + 5.0)

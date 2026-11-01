"""PostgreSQL-backed dispatcher: the live implementation of the RESILIENT strategy.

The `messages` table is the outbox. A worker claims due messages with `FOR UPDATE SKIP LOCKED`, so several
workers can run without double-sending, and a crash between claim and commit simply releases the rows.
Every attempt is a `delivery_attempts` row and every state change a `message_events` row.
"""

import json
import logging
import random
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from dadip.comms.adapters import Adapter, OutboundMessage
from dadip.comms.core import RESILIENT, Envelope, Outcome, State, StrategyConfig, after_attempt
from dadip.db.models import ChannelConfig, DeliveryAttempt, Message, MessageEvent

log = logging.getLogger(__name__)


def record_event(db: Session, msg: Message, state: str, detail: dict | None = None) -> None:
    db.add(MessageEvent(message_id=msg.id, state=state, detail=detail))


class Dispatcher:
    def __init__(self, adapters: dict[str, Adapter], cfg: StrategyConfig = RESILIENT, rng: random.Random | None = None,
                 publish=None, clock=lambda: datetime.now(UTC)):
        self.adapters = adapters
        self.cfg = cfg
        self.rng = rng or random.Random()  # noqa: S311 - jitter, not security
        self.publish = publish  # optional callable(dict) for live updates
        self.clock = clock

    def expire_overdue(self, db: Session) -> int:
        now = self.clock()
        rows = db.scalars(
            select(Message).where(Message.state.in_([State.queued, State.retry_scheduled]), Message.expires_at <= now)
            .with_for_update(skip_locked=True)
        ).all()
        for m in rows:
            m.state = State.expired
            record_event(db, m, State.expired, {"reason": "TTL reached before delivery"})
        db.commit()
        return len(rows)

    def _disabled_channels(self, db: Session) -> set[str]:
        return set(db.scalars(select(ChannelConfig.name).where(ChannelConfig.enabled.is_(False))).all())

    def run_once(self, db: Session, batch: int = 50) -> int:
        """Claim and process one batch. Returns the number of attempts made."""
        self.expire_overdue(db)
        now = self.clock()
        disabled = self._disabled_channels(db)
        available = [c for c in self.adapters if c not in disabled]
        if not available:
            return 0
        claimed = db.scalars(
            select(Message)
            .where(Message.state.in_([State.queued, State.retry_scheduled]), Message.next_attempt_at <= now,
                   Message.channel.in_(available))
            .order_by(Message.priority.desc(), Message.expires_at, Message.created_at)
            .limit(batch)
            .with_for_update(skip_locked=True)
        ).all()
        for m in claimed:
            self._attempt(db, m)
        db.commit()
        return len(claimed)

    def _attempt(self, db: Session, m: Message) -> None:
        adapter = self.adapters[m.channel]
        m.attempts += 1
        m.state = State.dispatching
        m.dispatched_at = m.dispatched_at or self.clock()
        started = self.clock()
        try:
            res = adapter.send(OutboundMessage(id=str(m.id), channel=m.channel, recipient=m.recipient,
                                               priority=m.priority, payload=m.payload))
            outcome, error, pid, latency = res.outcome, res.error, res.provider_message_id, res.latency_ms
        except Exception as e:  # an adapter bug must not stop the dispatcher
            log.exception("adapter raised", extra={"channel": m.channel, "message_id": str(m.id)})
            outcome, error, pid, latency = Outcome.transient_error, f"adapter exception: {type(e).__name__}", None, 0.0
        finished = self.clock()
        db.add(DeliveryAttempt(message_id=m.id, attempt_no=m.attempts, channel=m.channel, started_at=started,
                               finished_at=finished, latency_ms=latency, outcome=outcome.value,
                               provider_message_id=pid, error=error))
        env = Envelope(id=str(m.id), priority=m.priority, created_at=m.created_at, expires_at=m.expires_at,
                       idempotency_key=m.idempotency_key, state=State.dispatching, attempts=m.attempts)
        t = after_attempt(env, outcome, finished, self.cfg, self.rng, m.max_attempts)
        m.state = t.state
        m.last_error = error
        if t.next_attempt_at:
            m.next_attempt_at = t.next_attempt_at
        if t.state == State.delivered:
            m.delivered_at = finished
        record_event(db, m, t.state, {"attempt": m.attempts, "outcome": outcome.value, "reason": t.reason,
                                      "provider_message_id": pid})
        if self.publish:
            self.publish({"type": "message_state", "message_id": str(m.id), "state": t.state.value,
                          "channel": m.channel, "attempt": m.attempts})


def acknowledge(db: Session, message_id, via: str) -> bool:
    """Record an end-user acknowledgement. Idempotent: a second ack changes nothing."""
    now = datetime.now(UTC)
    res = db.execute(
        update(Message)
        # `queued` must be included. A fast device can ack while the dispatcher is still inside its transaction:
        # the committed row then still says `queued`. Matching it makes PostgreSQL wait for the dispatcher's row
        # lock and re-check the WHERE against the committed `delivered` row, instead of skipping the row and
        # losing the ack. Only a recipient holds the HMAC ack token, so an ack is proof of receipt in any state.
        # `retry_scheduled` likewise: the ack proves delivery even if the channel's confirmation was lost.
        .where(Message.id == message_id,
               Message.state.in_([State.queued, State.dispatching, State.retry_scheduled, State.delivered]))
        .values(state=State.acknowledged, acknowledged_at=now, delivered_at=func.coalesce(Message.delivered_at, now))
        .returning(Message.id)
    ).first()
    if res:
        db.add(MessageEvent(message_id=message_id, state=State.acknowledged, detail={"via": via}))
    return res is not None


def redis_publisher(redis_url: str, channel: str = "dadip:live"):
    import redis

    r = redis.Redis.from_url(redis_url, socket_timeout=1, socket_connect_timeout=1)

    def publish(event: dict) -> None:
        try:
            r.publish(channel, json.dumps(event, default=str))
        except Exception:
            log.warning("live update publish failed")

    return publish

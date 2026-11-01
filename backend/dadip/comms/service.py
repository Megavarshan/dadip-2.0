"""Alert lifecycle: create -> (approve | reject) -> enqueue messages -> dispatcher -> delivery -> ack."""

import hashlib
import hmac
import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from dadip.aura.pipeline import requires_approval
from dadip.comms import templates
from dadip.comms.core import idempotency_key, priority_for
from dadip.comms.dispatcher import record_event
from dadip.core.config import get_settings
from dadip.db.models import Alert, AuraAssessment, Incident, Message

ACTIVE_ALERT_STATES = ("pending_approval", "approved", "dispatched")
# Identical content to the same area and channel inside one window is sent once, even if two operators create
# the alert at the same moment (the unique index on messages.idempotency_key settles the race).
DEDUP_WINDOW_S = 15 * 60


def available_channels() -> set[str]:
    s = get_settings()
    out = set(s.enabled_channels)
    if s.telegram_bot_token and s.telegram_default_chat_id:
        out.add("telegram")
    if s.webhook_url:
        out.add("webhook")
    return out


class AlertError(Exception):
    def __init__(self, status: int, detail: str, existing_id: uuid.UUID | None = None):
        super().__init__(detail)
        self.status, self.detail, self.existing_id = status, detail, existing_id


def ack_token(message_id: uuid.UUID | str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"ack:{message_id}".encode(), hashlib.sha256).hexdigest()[:32]


def verify_ack_token(message_id: uuid.UUID | str, token: str) -> bool:
    return hmac.compare_digest(ack_token(message_id), token)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "all"


def recipient_for(channel: str, audience: str) -> str:
    """Broadcast semantics: one message per channel per alert (like cell broadcast), addressed to the area."""
    s = get_settings()
    if channel == "telegram":
        if not s.telegram_default_chat_id:
            raise AlertError(422, "telegram channel requires DADIP_TELEGRAM_DEFAULT_CHAT_ID")
        return s.telegram_default_chat_id
    if channel == "mqtt":
        return _slug(audience)
    if channel == "websocket":
        return "command-centre"
    if channel == "webhook":
        return "partner-agency"
    return f"broadcast:{_slug(audience)}"


def content_hash(title: str, body: str) -> str:
    return hashlib.sha256(f"{title}\n{body}".encode()).hexdigest()[:16]


def create_alert(db: Session, incident: Incident, *, body: str, channels: list[str], audience: str | None,
                 language: str, ttl_minutes: int, level: str | None, created_by: uuid.UUID) -> Alert:
    settings = get_settings()
    unknown = sorted(set(channels) - available_channels())
    if unknown:
        raise AlertError(422, f"channels not available (disabled or not configured): {', '.join(unknown)}")
    assessment = db.scalar(select(AuraAssessment).where(AuraAssessment.incident_id == incident.id)
                           .order_by(AuraAssessment.created_at.desc()).limit(1))
    aura_level = None
    if assessment:
        from dadip.aura.pipeline import level_for

        aura_level = level_for(assessment.composite_risk)
    level = level or aura_level
    if level is None:
        raise AlertError(422, "no AURA assessment for this incident: run /assess first or give an explicit level")
    decision = assessment.decision if assessment else None
    needs, reason = requires_approval(level, decision or "none", settings.approval_required_from_level)
    if level != aura_level and aura_level is not None:
        needs, reason = True, f"operator level '{level}' differs from AURA level '{aura_level}'"

    area = audience or incident.region or "affected area"
    title = templates.header(level, incident.hazard_type, area, language)
    chash = content_hash(title, body)
    existing = db.scalar(select(Alert).where(Alert.incident_id == incident.id, Alert.level == level,
                                             Alert.audience == area, Alert.status.in_(ACTIVE_ALERT_STATES),
                                             Alert.expires_at > datetime.now(UTC)))
    if existing and content_hash(existing.title, existing.body) == chash:
        raise AlertError(409, "an identical active alert already exists", existing.id)

    alert = Alert(incident_id=incident.id, assessment_id=assessment.id if assessment else None, level=level,
                  title=title, body=body, language=language, audience=area, channels=channels,
                  status="pending_approval" if needs else "approved", decision=decision,
                  requires_approval=needs, approval_reason=reason, created_by=created_by,
                  expires_at=datetime.now(UTC) + timedelta(minutes=ttl_minutes))
    db.add(alert)
    db.flush()
    if not needs:
        enqueue(db, alert, incident)
    return alert


def approve(db: Session, alert: Alert, approver_id: uuid.UUID, approver_is_admin: bool) -> Alert:
    if alert.status != "pending_approval":
        raise AlertError(409, f"alert is '{alert.status}', not pending approval")
    if alert.created_by == approver_id and not approver_is_admin:
        raise AlertError(403, "four-eyes rule: the creator cannot approve their own alert")
    if alert.expires_at <= datetime.now(UTC):
        alert.status = "expired"
        raise AlertError(409, "alert expired before approval")
    alert.status = "approved"
    alert.approved_by = approver_id
    alert.approved_at = datetime.now(UTC)
    enqueue(db, alert, db.get(Incident, alert.incident_id))
    return alert


def reject(alert: Alert, reason: str) -> Alert:
    if alert.status != "pending_approval":
        raise AlertError(409, f"alert is '{alert.status}', not pending approval")
    alert.status = "rejected"
    alert.rejection_reason = reason
    return alert


def enqueue(db: Session, alert: Alert, incident: Incident) -> tuple[int, int]:
    """Create one outbox message per channel. Returns (queued, suppressed_as_duplicate)."""
    composite = None
    if alert.assessment_id:
        a = db.get(AuraAssessment, alert.assessment_id)
        composite = a.composite_risk if a else None
    prio = priority_for(alert.level, composite)
    chash = content_hash(alert.title, alert.body)
    queued = suppressed = 0
    for ch in alert.channels:
        recipient = recipient_for(ch, alert.audience)
        mid = uuid.uuid4()
        window = int(datetime.now(UTC).timestamp() // DEDUP_WINDOW_S)
        key = idempotency_key(incident.id, alert.level, alert.audience, ch, recipient, chash, window)
        payload = {"alert_id": str(alert.id), "incident_id": str(incident.id), "level": alert.level,
                   "hazard": incident.hazard_type, "title": alert.title, "body": alert.body,
                   "language": alert.language, "expires_at": alert.expires_at.isoformat(),
                   "ack_path": f"/api/v1/messages/{mid}/ack?token={ack_token(mid)}"}
        stmt = insert(Message).values(
            id=mid, alert_id=alert.id, channel=ch, recipient=recipient, priority=prio, payload=payload,
            idempotency_key=key, state="queued", attempts=0, max_attempts=6, next_attempt_at=datetime.now(UTC),
            expires_at=alert.expires_at, created_at=datetime.now(UTC), updated_at=datetime.now(UTC),
        ).on_conflict_do_nothing(index_elements=["idempotency_key"]).returning(Message.id)
        if db.execute(stmt).scalar() is None:
            suppressed += 1
            continue
        queued += 1
        record_event(db, db.get(Message, mid), "queued", {"priority": prio})
    alert.status = "dispatched"
    return queued, suppressed


def cancel(db: Session, alert: Alert) -> int:
    msgs = db.scalars(select(Message).where(Message.alert_id == alert.id,
                                            Message.state.in_(["queued", "retry_scheduled"]))
                      .with_for_update(skip_locked=True)).all()
    for m in msgs:
        m.state = "cancelled"
        record_event(db, m, "cancelled", None)
    alert.status = "cancelled"
    return len(msgs)

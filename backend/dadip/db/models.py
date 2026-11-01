"""DADIP 2.0 relational model.

Conventions: UUID primary keys (generated in Python so ids exist before flush), timezone-aware timestamps,
closed value sets enforced with CHECK constraints (simpler to migrate than PostgreSQL ENUM types),
JSONB for model inputs/outputs that are versioned by `model_version` rather than by schema.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

HAZARDS = ("flood", "cyclone", "earthquake", "tsunami", "landslide", "fire", "heatwave", "other")
SEVERITIES = ("low", "moderate", "high", "critical")
ALERT_LEVELS = ("green", "yellow", "orange", "red")
DECISIONS = ("execute", "defer", "abstain")
ROLES = ("citizen", "operator", "approver", "admin")
INCIDENT_STATUSES = ("open", "monitoring", "closed")
REPORT_STATUSES = ("pending", "verified", "dismissed", "responded")
ALERT_STATUSES = ("pending_approval", "approved", "rejected", "dispatched", "cancelled", "expired")
MESSAGE_STATES = (
    "queued",
    "dispatching",
    "retry_scheduled",
    "delivered",
    "acknowledged",
    "failed",
    "expired",
    "duplicate_suppressed",
    "cancelled",
)
ATTEMPT_OUTCOMES = ("success", "transient_error", "permanent_error", "timeout")


def _now() -> datetime:
    return datetime.now(UTC)


def _in(column: str, values: tuple[str, ...]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


class Base(DeclarativeBase):
    type_annotation_map = {dict: JSONB, uuid.UUID: UUID(as_uuid=True), datetime: DateTime(timezone=True)}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="ck_users_role"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16), default="citizen", index=True)
    language: Mapped[str] = mapped_column(String(8), default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Incident(TimestampMixin, Base):
    """A disaster event the command centre tracks; reports and alerts attach to it."""

    __tablename__ = "incidents"
    __table_args__ = (
        CheckConstraint(_in("hazard_type", HAZARDS), name="ck_incidents_hazard"),
        CheckConstraint(_in("severity", SEVERITIES), name="ck_incidents_severity"),
        CheckConstraint(_in("status", INCIDENT_STATUSES), name="ck_incidents_status"),
        CheckConstraint("latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180", name="ck_incidents_coords"),
        UniqueConstraint("source", "external_id", name="uq_incidents_source_external"),
        Index("ix_incidents_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    hazard_type: Mapped[str] = mapped_column(String(16))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16))
    status: Mapped[str] = mapped_column(String(16), default="open")
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    region: Mapped[str | None] = mapped_column(String(120), index=True)
    source: Mapped[str] = mapped_column(String(60), default="manual")
    external_id: Mapped[str | None] = mapped_column(String(200))
    magnitude: Mapped[float | None] = mapped_column(Float)
    affected_population: Mapped[int | None] = mapped_column(Integer)
    # Provenance label shown in the UI: live (external feed), report, manual, demo or simulated.
    data_origin: Mapped[str] = mapped_column(String(16), default="manual")

    reports: Mapped[list["IncidentReport"]] = relationship(back_populates="incident")
    assessments: Mapped[list["AuraAssessment"]] = relationship(
        back_populates="incident", order_by="AuraAssessment.created_at.desc()"
    )


class IncidentReport(TimestampMixin, Base):
    """A citizen or field report. Contact details are visible to operators only."""

    __tablename__ = "incident_reports"
    __table_args__ = (
        CheckConstraint(_in("hazard_type", HAZARDS), name="ck_reports_hazard"),
        CheckConstraint(_in("reported_severity", SEVERITIES), name="ck_reports_severity"),
        CheckConstraint(_in("status", REPORT_STATUSES), name="ck_reports_status"),
        CheckConstraint("credibility IS NULL OR credibility BETWEEN 0 AND 1", name="ck_reports_credibility"),
        Index("ix_reports_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incidents.id", ondelete="SET NULL"), index=True)
    reporter_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reporter_name: Mapped[str] = mapped_column(String(200))
    contact: Mapped[str | None] = mapped_column(String(64))
    hazard_type: Mapped[str] = mapped_column(String(16))
    description: Mapped[str] = mapped_column(Text)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location_text: Mapped[str] = mapped_column(String(300))
    reported_severity: Mapped[str] = mapped_column(String(16), default="moderate")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    credibility: Mapped[float | None] = mapped_column(Float)
    credibility_detail: Mapped[dict | None]
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    source: Mapped[str] = mapped_column(String(16), default="web")  # web, edge, api

    incident: Mapped[Incident | None] = relationship(back_populates="reports")


class AuraAssessment(Base):
    """One run of the AURA pipeline. Inputs are stored so every assessment can be reproduced."""

    __tablename__ = "aura_assessments"
    __table_args__ = (
        CheckConstraint(_in("decision", DECISIONS), name="ck_assessments_decision"),
        Index("ix_assessments_incident_created", "incident_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    model_version: Mapped[str] = mapped_column(String(40))
    inputs: Mapped[dict]
    input_provenance: Mapped[dict]
    risk: Mapped[dict]
    reliability: Mapped[dict]
    distribution_shift: Mapped[dict]
    admissibility: Mapped[dict]
    explanation: Mapped[dict]
    uncertainty: Mapped[dict]
    composite_risk: Mapped[int] = mapped_column(Integer)
    admissibility_score: Mapped[float] = mapped_column(Float)
    decision: Mapped[str] = mapped_column(String(16))
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=_now)

    incident: Mapped[Incident] = relationship(back_populates="assessments")


class Alert(TimestampMixin, Base):
    """An alert an operator wants to send. It becomes messages only after it is approved."""

    __tablename__ = "alerts"
    __table_args__ = (
        CheckConstraint(_in("level", ALERT_LEVELS), name="ck_alerts_level"),
        CheckConstraint(_in("status", ALERT_STATUSES), name="ck_alerts_status"),
        Index("ix_alerts_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("aura_assessments.id", ondelete="SET NULL"))
    level: Mapped[str] = mapped_column(String(8))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    language: Mapped[str] = mapped_column(String(8), default="en")
    audience: Mapped[str] = mapped_column(String(120))
    channels: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default="pending_approval")
    decision: Mapped[str | None] = mapped_column(String(16))
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    approval_reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None]
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime]

    messages: Mapped[list["Message"]] = relationship(back_populates="alert")


class Message(TimestampMixin, Base):
    """One alert on one channel to one recipient. This table is the durable outbox."""

    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(_in("state", MESSAGE_STATES), name="ck_messages_state"),
        CheckConstraint("priority BETWEEN 0 AND 100", name="ck_messages_priority"),
        UniqueConstraint("idempotency_key", name="uq_messages_idempotency"),
        # The dispatcher's claim query: due, queued work in priority order.
        Index("ix_messages_due", "state", "next_attempt_at", "priority"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(32))
    recipient: Mapped[str] = mapped_column(String(200))
    priority: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict]
    idempotency_key: Mapped[str] = mapped_column(String(128))
    state: Mapped[str] = mapped_column(String(24), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=6)
    next_attempt_at: Mapped[datetime] = mapped_column(default=_now)
    expires_at: Mapped[datetime]
    last_error: Mapped[str | None] = mapped_column(Text)
    dispatched_at: Mapped[datetime | None]
    delivered_at: Mapped[datetime | None]
    acknowledged_at: Mapped[datetime | None]

    alert: Mapped[Alert | None] = relationship(back_populates="messages")
    attempts_log: Mapped[list["DeliveryAttempt"]] = relationship(
        back_populates="message", order_by="DeliveryAttempt.attempt_no"
    )


class MessageEvent(Base):
    """Append-only lifecycle log: every state transition of every message."""

    __tablename__ = "message_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    state: Mapped[str] = mapped_column(String(24))
    detail: Mapped[dict | None]
    created_at: Mapped[datetime] = mapped_column(default=_now, index=True)


class DeliveryAttempt(Base):
    __tablename__ = "delivery_attempts"
    __table_args__ = (
        CheckConstraint(_in("outcome", ATTEMPT_OUTCOMES), name="ck_attempts_outcome"),
        UniqueConstraint("message_id", "attempt_no", name="uq_attempts_message_no"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    attempt_no: Mapped[int] = mapped_column(Integer)
    channel: Mapped[str] = mapped_column(String(32))
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime]
    latency_ms: Mapped[float] = mapped_column(Float)
    outcome: Mapped[str] = mapped_column(String(20))
    provider_message_id: Mapped[str | None] = mapped_column(String(200))
    error: Mapped[str | None] = mapped_column(Text)

    message: Mapped[Message] = relationship(back_populates="attempts_log")


class ChannelConfig(Base):
    """Runtime switch per channel. `is_mock` is shown wherever delivery numbers are displayed."""

    __tablename__ = "channel_configs"

    name: Mapped[str] = mapped_column(String(32), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    is_mock: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)


class EdgeDevice(Base):
    __tablename__ = "edge_devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    region: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(16), default="unknown")  # online, offline, unknown
    last_seen_at: Mapped[datetime | None]
    queue_depth: Mapped[int] = mapped_column(Integer, default=0)
    meta: Mapped[dict | None]
    created_at: Mapped[datetime] = mapped_column(default=_now)


class EdgeEvent(Base):
    """An event uploaded from an edge device. The device-generated id makes upload idempotent."""

    __tablename__ = "edge_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("edge_devices.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    payload: Mapped[dict]
    created_at_device: Mapped[datetime]
    received_at: Mapped[datetime] = mapped_column(default=_now)


class Resource(Base):
    """Help centres, shelters and response units (ported from the original help_centers table)."""

    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(32))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    address: Mapped[str | None] = mapped_column(String(300))
    phone: Mapped[str | None] = mapped_column(String(40))
    capacity: Mapped[int | None] = mapped_column(Integer)
    occupancy: Mapped[int] = mapped_column(Integer, default=0)
    operational: Mapped[bool] = mapped_column(Boolean, default=True)
    region: Mapped[str | None] = mapped_column(String(120))
    data_origin: Mapped[str] = mapped_column(String(16), default="demo")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(40))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict | None]
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(default=_now, index=True)


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    experiment: Mapped[str] = mapped_column(String(80), index=True)
    scenario: Mapped[str] = mapped_column(String(60))
    strategy: Mapped[str] = mapped_column(String(30))
    seed: Mapped[int] = mapped_column(Integer)
    config: Mapped[dict]
    metrics: Mapped[dict]
    software_version: Mapped[str] = mapped_column(String(60))
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime]

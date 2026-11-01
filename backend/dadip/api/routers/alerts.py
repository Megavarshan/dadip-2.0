import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from dadip.api.deps import Approver, DbSession, Operator
from dadip.api.schemas import ORM, Page
from dadip.comms import service
from dadip.core.security import Role
from dadip.db.models import Alert, Incident, Message
from dadip.services import audit

router = APIRouter(prefix="/alerts", tags=["alerts"])

Level = Literal["green", "yellow", "orange", "red"]


class AlertIn(BaseModel):
    incident_id: uuid.UUID
    body: str = Field(min_length=5, max_length=1000)
    channels: list[str] = Field(min_length=1, max_length=6)
    audience: str | None = Field(default=None, max_length=120)
    language: Literal["en", "hi", "ta"] = "en"
    ttl_minutes: int = Field(default=120, ge=5, le=24 * 60)
    level: Level | None = None


class RejectIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class MessageBrief(ORM):
    id: uuid.UUID
    channel: str
    recipient: str
    priority: int
    state: str
    attempts: int
    last_error: str | None
    created_at: datetime
    delivered_at: datetime | None
    acknowledged_at: datetime | None


class AlertOut(ORM):
    id: uuid.UUID
    incident_id: uuid.UUID
    assessment_id: uuid.UUID | None
    level: Level
    title: str
    body: str
    language: str
    audience: str
    channels: list[str]
    status: str
    decision: str | None
    requires_approval: bool
    approval_reason: str | None
    created_by: uuid.UUID | None
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    rejection_reason: str | None
    expires_at: datetime
    created_at: datetime


class AlertDetail(AlertOut):
    messages: list[MessageBrief]


def _get(db, alert_id: uuid.UUID) -> Alert:
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    return alert


def _raise(e: service.AlertError):
    detail = {"message": e.detail}
    if e.existing_id:
        detail["existing_alert_id"] = str(e.existing_id)
    raise HTTPException(e.status, detail) from None


@router.post("", response_model=AlertOut, status_code=status.HTTP_201_CREATED)
def create(body: AlertIn, db: DbSession, user: Operator) -> Alert:
    """Create an alert from an incident. AURA's latest assessment sets the level and decides whether an
    approver must sign off; alerts that need approval send nothing until approved."""
    incident = db.get(Incident, body.incident_id)
    if not incident:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    try:
        alert = service.create_alert(db, incident, body=body.body, channels=body.channels, audience=body.audience,
                                     language=body.language, ttl_minutes=body.ttl_minutes, level=body.level,
                                     created_by=user.id)
    except service.AlertError as e:
        db.rollback()
        _raise(e)
    audit.record(db, "CREATE_ALERT", actor_id=user.id, resource_type="alert", resource_id=alert.id,
                 details={"level": alert.level, "requires_approval": alert.requires_approval,
                          "reason": alert.approval_reason, "channels": alert.channels})
    db.commit()
    return alert


@router.get("", response_model=Page[AlertOut])
def list_alerts(db: DbSession, _: Operator, status_: Annotated[str | None, Query(alias="status")] = None,
                limit: Annotated[int, Query(ge=1, le=200)] = 50,
                offset: Annotated[int, Query(ge=0)] = 0) -> Page[AlertOut]:
    q = select(Alert)
    if status_:
        q = q.where(Alert.status == status_)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Alert.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[AlertOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/{alert_id}", response_model=AlertDetail)
def get_alert(alert_id: uuid.UUID, db: DbSession, _: Operator) -> AlertDetail:
    alert = _get(db, alert_id)
    msgs = db.scalars(select(Message).where(Message.alert_id == alert.id).order_by(Message.created_at)).all()
    return AlertDetail.model_validate({**AlertOut.model_validate(alert).model_dump(),
                                       "messages": [MessageBrief.model_validate(m) for m in msgs]})


@router.post("/{alert_id}/approve", response_model=AlertOut)
def approve(alert_id: uuid.UUID, db: DbSession, user: Approver) -> Alert:
    alert = _get(db, alert_id)
    try:
        service.approve(db, alert, user.id, user.role == Role.admin)
    except service.AlertError as e:
        db.commit()  # persists an 'expired' status change if that was the reason
        _raise(e)
    audit.record(db, "APPROVE_ALERT", actor_id=user.id, resource_type="alert", resource_id=alert.id)
    db.commit()
    return alert


@router.post("/{alert_id}/reject", response_model=AlertOut)
def reject(alert_id: uuid.UUID, body: RejectIn, db: DbSession, user: Approver) -> Alert:
    alert = _get(db, alert_id)
    try:
        service.reject(alert, body.reason)
    except service.AlertError as e:
        _raise(e)
    audit.record(db, "REJECT_ALERT", actor_id=user.id, resource_type="alert", resource_id=alert.id,
                 details={"reason": body.reason})
    db.commit()
    return alert


@router.post("/{alert_id}/cancel", response_model=AlertOut)
def cancel(alert_id: uuid.UUID, db: DbSession, user: Approver) -> Alert:
    alert = _get(db, alert_id)
    n = service.cancel(db, alert)
    audit.record(db, "CANCEL_ALERT", actor_id=user.id, resource_type="alert", resource_id=alert.id,
                 details={"messages_cancelled": n})
    db.commit()
    return alert

import uuid
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from dadip.api.deps import DbSession, Operator
from dadip.api.schemas import IncidentIn, IncidentOut, IncidentPatch, IncidentStatus, Page, Severity
from dadip.db.models import Incident
from dadip.services import audit

router = APIRouter(prefix="/incidents", tags=["incidents"])


@router.get("", response_model=Page[IncidentOut])
def list_incidents(
    db: DbSession,
    status_: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    severity: Severity | None = None,
    hazard_type: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[IncidentOut]:
    """Public: incidents are what the public map shows."""
    q = select(Incident)
    if status_:
        q = q.where(Incident.status == status_)
    if severity:
        q = q.where(Incident.severity == severity)
    if hazard_type:
        q = q.where(Incident.hazard_type == hazard_type)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Incident.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[IncidentOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/{incident_id}", response_model=IncidentOut)
def get_incident(incident_id: uuid.UUID, db: DbSession) -> Incident:
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    return inc


@router.post("", response_model=IncidentOut, status_code=status.HTTP_201_CREATED)
def create_incident(body: IncidentIn, db: DbSession, user: Operator) -> Incident:
    inc = Incident(**body.model_dump(), source="manual", data_origin="manual")
    db.add(inc)
    db.flush()
    audit.record(db, "CREATE_INCIDENT", actor_id=user.id, resource_type="incident", resource_id=inc.id,
                 details={"severity": inc.severity, "hazard": inc.hazard_type})
    db.commit()
    return inc


@router.patch("/{incident_id}", response_model=IncidentOut)
def update_incident(incident_id: uuid.UUID, body: IncidentPatch, db: DbSession, user: Operator) -> Incident:
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(inc, k, v)
    audit.record(db, "UPDATE_INCIDENT", actor_id=user.id, resource_type="incident", resource_id=inc.id,
                 details=changes)
    db.commit()
    return inc

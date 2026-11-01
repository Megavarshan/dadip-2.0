import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select

from dadip.api.deps import DbSession, Operator
from dadip.api.schemas import AssessmentOut, IncidentIn, IncidentOut, IncidentPatch, IncidentStatus, Page, Severity
from dadip.aura import weather
from dadip.db.models import AuraAssessment, Incident
from dadip.services import audit
from dadip.services.intelligence import assess_incident


def get_weather_fetcher():
    """Overridable in tests; live Open-Meteo in production."""
    return weather.fetch_current

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


@router.post("/{incident_id}/assess", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
def assess(
    incident_id: uuid.UUID,
    db: DbSession,
    user: Operator,
    fetcher: Annotated[object, Depends(get_weather_fetcher)],
    live_weather: bool = True,
) -> AuraAssessment:
    """Run AURA on the incident. With `live_weather`, current conditions at the incident location come from
    Open-Meteo; if unavailable the inputs are marked `default` and the assessment says so."""
    inc = db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Incident not found")
    row = assess_incident(db, inc, user.id, fetcher if live_weather else None)
    audit.record(db, "AURA_ASSESS", actor_id=user.id, resource_type="incident", resource_id=inc.id,
                 details={"assessment_id": str(row.id), "decision": row.decision, "risk": row.composite_risk})
    db.commit()
    return row


@router.get("/{incident_id}/assessments", response_model=list[AssessmentOut])
def list_assessments(incident_id: uuid.UUID, db: DbSession, _: Operator,
                     limit: Annotated[int, Query(ge=1, le=50)] = 10) -> list[AuraAssessment]:
    q = (select(AuraAssessment).where(AuraAssessment.incident_id == incident_id)
         .order_by(AuraAssessment.created_at.desc()).limit(limit))
    return list(db.scalars(q).all())

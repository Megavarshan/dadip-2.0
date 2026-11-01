import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select

from dadip.api.deps import DbSession, Operator, client_ip, get_current_user_optional, public_report_limit
from dadip.api.schemas import Page, ReportIn, ReportOut, ReportPatch, ReportPublicOut, ReportStatus
from dadip.db.models import Incident, IncidentReport, User
from dadip.services import audit
from dadip.services.intelligence import score_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", response_model=ReportPublicOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(public_report_limit)])
def submit_report(
    body: ReportIn,
    db: DbSession,
    request: Request,
    user: Annotated[User | None, Depends(get_current_user_optional)],
) -> IncidentReport:
    """Anyone may report (rate-limited per IP). Reports start as `pending` and never trigger alerts by
    themselves: an operator verifies, AURA assesses, an approver signs off."""
    report = IncidentReport(**body.model_dump(), reporter_user_id=user.id if user else None, source="web")
    db.add(report)
    db.flush()
    score_report(db, report)
    audit.record(db, "SUBMIT_REPORT", actor_id=user.id if user else None, resource_type="report",
                 resource_id=report.id, details={"hazard": report.hazard_type}, ip_address=client_ip(request))
    db.commit()
    return report


@router.get("", response_model=Page[ReportOut])
def list_reports(
    db: DbSession,
    _: Operator,
    status_: Annotated[ReportStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ReportOut]:
    q = select(IncidentReport)
    if status_:
        q = q.where(IncidentReport.status == status_)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(IncidentReport.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[ReportOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(report_id: uuid.UUID, body: ReportPatch, db: DbSession, user: Operator) -> IncidentReport:
    report = db.get(IncidentReport, report_id)
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Report not found")
    changes = body.model_dump(exclude_unset=True)
    if "incident_id" in changes and changes["incident_id"] and not db.get(Incident, changes["incident_id"]):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "incident_id does not exist")
    for k, v in changes.items():
        setattr(report, k, v)
    if changes.get("status") in ("verified", "responded"):
        report.verified_by = user.id
    audit.record(db, "UPDATE_REPORT", actor_id=user.id, resource_type="report", resource_id=report.id,
                 details={k: str(v) for k, v in changes.items()})
    db.commit()
    return report

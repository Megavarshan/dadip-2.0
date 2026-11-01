"""Health, resources and audit log."""

from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, select, text

from dadip import __version__
from dadip.api.deps import Admin, DbSession
from dadip.api.schemas import AuditOut, Page, ResourceOut
from dadip.core.config import get_settings
from dadip.db.models import AuditEvent, Resource

router = APIRouter(tags=["system"])


def _check_redis() -> str:
    try:
        import redis

        redis.Redis.from_url(get_settings().redis_url, socket_timeout=0.3, socket_connect_timeout=0.3).ping()
        return "ok"
    except Exception as e:
        return f"error: {type(e).__name__}"


@router.get("/health/live")
def live() -> dict:
    """The process is up. Used by container orchestrators to decide restarts."""
    return {"status": "ok", "version": __version__}


@router.get("/health/ready")
def ready(db: DbSession) -> JSONResponse:
    """Dependencies are reachable. Database is required; Redis degrades rate limiting and live updates."""
    checks: dict[str, str] = {}
    try:
        db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {type(e).__name__}"
    checks["redis"] = _check_redis()
    ok = checks["database"] == "ok"
    return JSONResponse({"status": "ok" if ok else "degraded", "checks": checks, "version": __version__},
                        status_code=200 if ok else 503)


@router.get("/resources", response_model=list[ResourceOut], tags=["resources"])
def list_resources(db: DbSession, region: str | None = None) -> list[Resource]:
    q = select(Resource).where(Resource.operational.is_(True)).order_by(Resource.name)
    if region:
        q = q.where(Resource.region.ilike(f"%{region}%"))
    return list(db.scalars(q).all())


@router.get("/audit", response_model=Page[AuditOut], tags=["audit"])
def audit_log(
    db: DbSession,
    _: Admin,
    action: str | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[AuditOut]:
    q = select(AuditEvent)
    if action:
        q = q.where(AuditEvent.action == action)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(AuditEvent.id.desc()).limit(limit).offset(offset)).all()
    return Page(items=[AuditOut.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)

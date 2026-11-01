from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from dadip.api.deps import DbSession, Operator
from dadip.api.schemas import ORM
from dadip.db.models import EdgeDevice, EdgeEvent

router = APIRouter(prefix="/edge", tags=["edge"])


class DeviceOut(ORM):
    id: str
    name: str
    region: str | None
    status: str
    last_seen_at: datetime | None
    queue_depth: int


class EdgeEventOut(ORM):
    id: str
    device_id: str
    kind: str
    payload: dict
    created_at_device: datetime
    received_at: datetime


@router.get("/devices", response_model=list[DeviceOut])
def devices(db: DbSession, _: Operator) -> list[EdgeDevice]:
    return list(db.scalars(select(EdgeDevice).order_by(EdgeDevice.id)))


@router.get("/events", response_model=list[EdgeEventOut])
def events(db: DbSession, _: Operator, device_id: str | None = None,
           limit: Annotated[int, Query(ge=1, le=500)] = 100) -> list[dict]:
    q = select(EdgeEvent).order_by(EdgeEvent.received_at.desc()).limit(limit)
    if device_id:
        q = q.where(EdgeEvent.device_id == device_id)
    return [{**EdgeEventOut.model_validate({**e.__dict__, "id": str(e.id)}).model_dump()} for e in db.scalars(q)]

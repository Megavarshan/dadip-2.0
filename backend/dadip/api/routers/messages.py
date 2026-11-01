import asyncio
import contextlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel
from sqlalchemy import func, select

from dadip.api.deps import Admin, DbSession, Operator
from dadip.api.routers.alerts import MessageBrief
from dadip.api.schemas import ORM, Page
from dadip.comms.dispatcher import acknowledge
from dadip.comms.service import available_channels, verify_ack_token
from dadip.core.config import get_settings
from dadip.core.security import decode_access_token
from dadip.db.models import ChannelConfig, DeliveryAttempt, Message, MessageEvent
from dadip.services import audit

router = APIRouter(tags=["messages"])


class AttemptOut(ORM):
    attempt_no: int
    channel: str
    started_at: datetime
    latency_ms: float
    outcome: str
    provider_message_id: str | None
    error: str | None


class EventOut(ORM):
    state: str
    detail: dict | None
    created_at: datetime


class MessageDetail(MessageBrief):
    payload: dict
    expires_at: datetime
    attempts_log: list[AttemptOut]
    events: list[EventOut]


@router.get("/messages", response_model=Page[MessageBrief])
def list_messages(db: DbSession, _: Operator, state: str | None = None, channel: str | None = None,
                  limit: Annotated[int, Query(ge=1, le=500)] = 100,
                  offset: Annotated[int, Query(ge=0)] = 0) -> Page[MessageBrief]:
    q = select(Message)
    if state:
        q = q.where(Message.state == state)
    if channel:
        q = q.where(Message.channel == channel)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.order_by(Message.created_at.desc()).limit(limit).offset(offset)).all()
    return Page(items=[MessageBrief.model_validate(r) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/messages/stats")
def stats(db: DbSession, _: Operator, hours: Annotated[int, Query(ge=1, le=24 * 30)] = 24) -> dict:
    """Delivery statistics computed from recorded messages and attempts only. Each channel row states
    whether it is a mock, so mock deliveries are never presented as real ones."""
    since = datetime.now(UTC) - timedelta(hours=hours)
    mocks = {c.name: c.is_mock for c in db.scalars(select(ChannelConfig))}
    rows = db.execute(select(Message.channel, Message.state, func.count()).where(Message.created_at >= since)
                      .group_by(Message.channel, Message.state)).all()
    by_channel: dict[str, dict] = {}
    for ch, st, n in rows:
        entry = by_channel.setdefault(ch, {"states": {}, "is_mock": mocks.get(ch, ch.startswith("mock_"))})
        entry["states"][st] = n
    e2e = func.extract("epoch", Message.delivered_at - Message.created_at)
    lat = db.execute(
        select(Message.channel, func.percentile_cont(0.5).within_group(e2e),
               func.percentile_cont(0.95).within_group(e2e), func.avg(Message.attempts))
        .where(Message.created_at >= since, Message.delivered_at.is_not(None)).group_by(Message.channel)
    ).all()
    for ch, p50, p95, avg_attempts in lat:
        by_channel.setdefault(ch, {"states": {}, "is_mock": mocks.get(ch, False)}).update(
            {"latency_p50_s": round(p50, 3), "latency_p95_s": round(p95, 3),
             "avg_attempts_delivered": round(float(avg_attempts), 2)})
    for v in by_channel.values():
        s = v["states"]
        terminal = sum(s.get(k, 0) for k in ("delivered", "acknowledged", "failed", "expired"))
        ok = s.get("delivered", 0) + s.get("acknowledged", 0)
        v["delivery_ratio"] = round(ok / terminal, 4) if terminal else None
        v["ack_ratio"] = round(s.get("acknowledged", 0) / ok, 4) if ok else None
    return {"window_hours": hours, "channels": by_channel,
            "note": "Ratios use terminal messages only; mock channels simulate provider acceptance."}


@router.get("/messages/{message_id}", response_model=MessageDetail)
def get_message(message_id: uuid.UUID, db: DbSession, _: Operator) -> dict:
    m = db.get(Message, message_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    events = db.scalars(select(MessageEvent).where(MessageEvent.message_id == m.id).order_by(MessageEvent.id)).all()
    attempts = db.scalars(select(DeliveryAttempt).where(DeliveryAttempt.message_id == m.id)
                          .order_by(DeliveryAttempt.attempt_no)).all()
    return {**MessageBrief.model_validate(m).model_dump(), "payload": m.payload, "expires_at": m.expires_at,
            "attempts_log": [AttemptOut.model_validate(a) for a in attempts],
            "events": [EventOut.model_validate(e) for e in events]}


@router.post("/messages/{message_id}/ack")
def ack(message_id: uuid.UUID, token: str, db: DbSession) -> dict:
    """Recipient acknowledgement. Public, but needs the per-message token included in the alert payload."""
    if not verify_ack_token(message_id, token):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid acknowledgement token")
    changed = acknowledge(db, message_id, via="http")
    db.commit()
    return {"acknowledged": True, "changed": changed}


class ChannelOut(ORM):
    name: str
    enabled: bool
    is_mock: bool
    configured: bool = False  # credentials / settings present so the dispatcher can actually use it


class ChannelPatch(BaseModel):
    enabled: bool


@router.get("/channels", response_model=list[ChannelOut])
def channels(db: DbSession, _: Operator) -> list[ChannelOut]:
    usable = available_channels()
    return [ChannelOut(name=c.name, enabled=c.enabled, is_mock=c.is_mock, configured=c.name in usable)
            for c in db.scalars(select(ChannelConfig).order_by(ChannelConfig.name))]


@router.patch("/channels/{name}", response_model=ChannelOut)
def set_channel(name: str, body: ChannelPatch, db: DbSession, user: Admin) -> ChannelConfig:
    ch = db.get(ChannelConfig, name)
    if not ch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Channel not found")
    ch.enabled = body.enabled
    audit.record(db, "SET_CHANNEL", actor_id=user.id, resource_type="channel", resource_id=name,
                 details={"enabled": body.enabled})
    db.commit()
    return ChannelOut(name=ch.name, enabled=ch.enabled, is_mock=ch.is_mock, configured=ch.name in available_channels())


@router.websocket("/live")
async def live(ws: WebSocket, token: str) -> None:
    """Live updates for the command centre (message states, alerts). Requires an operator token."""
    try:
        claims = decode_access_token(token)
        if claims.get("role") == "citizen":
            raise ValueError
    except Exception:
        await ws.close(code=4401)
        return
    await ws.accept()
    import redis.asyncio as aioredis

    r = aioredis.Redis.from_url(get_settings().redis_url)
    pubsub = r.pubsub()
    await pubsub.subscribe("dadip:live")
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg:
                await ws.send_text(msg["data"].decode())
            await asyncio.sleep(0)
    except WebSocketDisconnect:
        pass
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe("dadip:live")
            await r.aclose()

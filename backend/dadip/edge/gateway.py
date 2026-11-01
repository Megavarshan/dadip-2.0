"""Cloud side of the edge network: `dadip-edge-gateway`.

Subscribes to device events and status, stores them idempotently (`edge_events.id` is the device-generated
event id; a re-sent event is dropped by `ON CONFLICT DO NOTHING`), and turns `report` events into incident
reports that go through the same credibility scoring as web reports.
"""

import json
import logging
import signal
import threading
import uuid
from datetime import UTC, datetime

import paho.mqtt.client as mqtt
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from dadip.db.models import EdgeDevice, EdgeEvent, IncidentReport
from dadip.db.session import get_sessionmaker
from dadip.services.intelligence import score_report

log = logging.getLogger("dadip.edge.gateway")


def _parse_ts(value: str | None) -> datetime:
    try:
        return datetime.fromisoformat(value) if value else datetime.now(UTC)
    except ValueError:
        return datetime.now(UTC)


def upsert_device(db: Session, device_id: str, **fields) -> None:
    values = {"id": device_id, "name": device_id, "created_at": datetime.now(UTC), **fields}
    stmt = insert(EdgeDevice).values(**values)
    update = {k: stmt.excluded[k] for k in fields}
    db.execute(stmt.on_conflict_do_update(index_elements=["id"], set_=update) if update
               else stmt.on_conflict_do_nothing(index_elements=["id"]))


def ingest_event(db: Session, body: dict) -> bool:
    """Returns True if the event was new, False if it was a duplicate."""
    device_id = str(body["device_id"])[:64]
    upsert_device(db, device_id, last_seen_at=datetime.now(UTC), status="online")
    event_id = uuid.UUID(body["event_id"])
    inserted = db.execute(
        insert(EdgeEvent).values(id=event_id, device_id=device_id, kind=str(body["kind"])[:32],
                                 payload=body.get("payload") or {}, created_at_device=_parse_ts(body.get("created_at")),
                                 received_at=datetime.now(UTC))
        .on_conflict_do_nothing(index_elements=["id"]).returning(EdgeEvent.id)
    ).scalar()
    if inserted is None:
        return False
    if body["kind"] == "report":
        p = body["payload"]
        report = IncidentReport(reporter_name=str(p.get("reporter_name", f"edge:{device_id}"))[:200],
                                hazard_type=p["hazard_type"], description=str(p["description"])[:4000],
                                latitude=float(p["latitude"]), longitude=float(p["longitude"]),
                                location_text=str(p.get("location_text", device_id))[:300],
                                reported_severity=p.get("reported_severity", "moderate"), source="edge",
                                created_at=_parse_ts(body.get("created_at")))
        db.add(report)
        db.flush()
        score_report(db, report)
    return True


def handle_status(db: Session, device_id: str, body: dict) -> None:
    upsert_device(db, device_id[:64], status=str(body.get("status", "unknown"))[:16],
                  queue_depth=int(body.get("queue_depth") or 0), region=body.get("area"),
                  last_seen_at=datetime.now(UTC))


class Gateway:
    def __init__(self, host: str, port: int, username: str | None = None, password: str | None = None,
                 client_id: str = "dadip-edge-gateway"):
        self.ready = threading.Event()
        self.stats = {"new": 0, "duplicate": 0, "invalid": 0}
        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, clean_session=False)
        if username:
            c.username_pw_set(username, password)
        c.on_connect = self._on_connect
        c.on_message = self._on_message
        self.client, self._host, self._port = c, host, port

    def _on_connect(self, c, userdata, flags, rc, props=None):
        c.subscribe([("dadip/edge/+/events", 1), ("dadip/edge/+/status", 1)])
        self.ready.set()

    def _on_message(self, c, userdata, m):
        parts = m.topic.split("/")
        if not m.payload:
            return  # an empty retained message only clears the broker's copy
        try:
            body = json.loads(m.payload)
            with get_sessionmaker()() as db:
                if parts[-1] == "status":
                    handle_status(db, parts[2], body)
                else:
                    self.stats["new" if ingest_event(db, body) else "duplicate"] += 1
                db.commit()
        except Exception:
            self.stats["invalid"] += 1
            log.exception("edge gateway: failed to handle message", extra={"topic": m.topic})

    def start(self) -> None:
        self.client.connect_async(self._host, self._port, keepalive=30)
        self.client.loop_start()

    def stop(self) -> None:
        self.client.disconnect()
        self.client.loop_stop()


def main() -> None:
    from dadip.core.config import get_settings
    from dadip.core.logging import configure_logging

    configure_logging()
    s = get_settings()
    gw = Gateway(s.mqtt_host, s.mqtt_port, s.mqtt_username, s.mqtt_password)
    gw.start()
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    while not stop.wait(30):
        log.info("edge gateway", extra=gw.stats)
    gw.stop()


if __name__ == "__main__":
    main()

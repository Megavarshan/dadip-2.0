import json
import random
import threading
import time
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import paho.mqtt.client as mqtt
import pytest
from sqlalchemy import func, select

from dadip.comms.adapters import MockAdapter, MqttAdapter, OutboundMessage, WebhookAdapter
from dadip.comms.core import Outcome
from dadip.comms.dispatcher import Dispatcher
from dadip.db.models import DeliveryAttempt, Message, MessageEvent
from dadip.db.session import get_sessionmaker
from tests.integration.test_api_foundation import INCIDENT

pytestmark = pytest.mark.integration


@pytest.fixture
def incident_with_assessment(client, auth_header):
    h = auth_header("operator")
    inc = client.post("/api/v1/incidents", json=INCIDENT, headers=h).json()
    r = client.post(f"/api/v1/incidents/{inc['id']}/assess?live_weather=false", headers=h)
    assert r.status_code == 201
    return inc, h


def make_alert(client, h, inc_id, **kw):
    body = {"incident_id": inc_id, "body": "Move to higher ground now. Avoid river banks.",
            "channels": ["mock_sms", "mock_whatsapp"], "audience": "Supaul district", **kw}
    return client.post("/api/v1/alerts", json=body, headers=h)


def dispatch_all(adapters, rounds=20, **kw):
    d = Dispatcher(adapters, rng=random.Random(7), **kw)
    with get_sessionmaker()() as db:
        for _ in range(rounds):
            if d.run_once(db) == 0:
                break
    return d


def test_alert_requires_approval_and_sends_nothing_before(client, incident_with_assessment, db):
    inc, h_op = incident_with_assessment
    r = make_alert(client, h_op, inc["id"])
    assert r.status_code == 201, r.text
    alert = r.json()
    # With the original AURA constants 'execute' is unreachable, so every alert needs a human.
    assert alert["requires_approval"] is True and alert["status"] == "pending_approval"
    assert db.scalar(select(func.count()).select_from(Message)) == 0


def test_four_eyes_rule(client, incident_with_assessment, make_user):
    inc, _ = incident_with_assessment
    approver = make_user("approver", email="self@example.com")
    from tests.conftest import PASSWORD

    tok = client.post("/api/v1/auth/login", json={"email": approver.email, "password": PASSWORD}).json()
    h_self = {"Authorization": f"Bearer {tok['access_token']}"}
    alert = make_alert(client, h_self, inc["id"]).json()
    r = client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=h_self)
    assert r.status_code == 403 and "four-eyes" in r.text


def test_operator_cannot_approve(client, incident_with_assessment):
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"]).json()
    assert client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=h_op).status_code == 403


def test_full_lifecycle_approve_dispatch_ack(client, incident_with_assessment, auth_header):
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"], language="hi").json()
    from dadip.comms.templates import LEVEL

    assert alert["title"] == f"{LEVEL['hi'][alert['level']]}: बाढ़ — Supaul district"
    h_ap = auth_header("approver")
    r = client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=h_ap)
    assert r.status_code == 200 and r.json()["status"] == "dispatched"

    sms, wa = MockAdapter("mock_sms"), MockAdapter("mock_whatsapp")
    dispatch_all({"mock_sms": sms, "mock_whatsapp": wa})
    assert len(sms.sent) == 1 and len(wa.sent) == 1

    detail = client.get(f"/api/v1/alerts/{alert['id']}", headers=h_op).json()
    assert {m["state"] for m in detail["messages"]} == {"delivered"}
    mid = detail["messages"][0]["id"]
    msg = client.get(f"/api/v1/messages/{mid}", headers=h_op).json()
    assert [e["state"] for e in msg["events"]] == ["queued", "delivered"]
    assert msg["attempts_log"][0]["outcome"] == "success"

    ack_path = msg["payload"]["ack_path"]
    assert client.post(ack_path.replace("token=", "token=bad")).status_code == 403
    assert client.post(ack_path).json()["changed"] is True
    assert client.post(ack_path).json()["changed"] is False  # idempotent
    assert client.get(f"/api/v1/messages/{mid}", headers=h_op).json()["state"] == "acknowledged"

    stats = client.get("/api/v1/messages/stats", headers=h_op).json()["channels"]
    assert stats["mock_sms"]["is_mock"] is True
    assert stats["mock_sms"]["delivery_ratio"] == 1.0


def test_retry_then_success_records_every_attempt(client, incident_with_assessment, auth_header, db):
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"], channels=["mock_sms"]).json()
    client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=auth_header("approver"))

    flaky = MockAdapter("mock_sms")
    calls = {"n": 0}
    real_send = flaky.send

    def send(m):
        calls["n"] += 1
        if calls["n"] <= 2:
            return type(real_send(m))(Outcome.transient_error, 1.0, error="gateway 503")
        return real_send(m)

    flaky.send = send
    clock = {"t": datetime.now(UTC)}
    d = Dispatcher({"mock_sms": flaky}, rng=random.Random(1), clock=lambda: clock["t"])
    with get_sessionmaker()() as s:
        for _ in range(10):
            d.run_once(s)
            clock["t"] += timedelta(minutes=5)  # move past any backoff
    m = db.scalar(select(Message))
    db.refresh(m)
    assert m.state == "delivered" and m.attempts == 3
    outcomes = db.scalars(select(DeliveryAttempt.outcome).where(DeliveryAttempt.message_id == m.id)
                          .order_by(DeliveryAttempt.attempt_no)).all()
    assert outcomes == ["transient_error", "transient_error", "success"]
    states = db.scalars(select(MessageEvent.state).where(MessageEvent.message_id == m.id)
                        .order_by(MessageEvent.id)).all()
    assert states == ["queued", "retry_scheduled", "retry_scheduled", "delivered"]


def test_ttl_expiry_never_sends_late(client, incident_with_assessment, auth_header, db):
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"], channels=["mock_sms"], ttl_minutes=5).json()
    client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=auth_header("approver"))
    sms = MockAdapter("mock_sms")
    later = datetime.now(UTC) + timedelta(minutes=6)
    Dispatcher({"mock_sms": sms}, clock=lambda: later).run_once(get_sessionmaker()())
    assert sms.sent == []
    assert db.scalar(select(Message.state)) == "expired"


def test_duplicate_alert_rejected_and_messages_deduplicated(client, incident_with_assessment, auth_header, db):
    inc, h_op = incident_with_assessment
    first = make_alert(client, h_op, inc["id"]).json()
    dup = make_alert(client, h_op, inc["id"])
    assert dup.status_code == 409 and dup.json()["detail"]["existing_alert_id"] == first["id"]

    # Race: two identical alerts slip past the alert-level check; the message idempotency key still holds.
    from dadip.comms import service
    from dadip.db.models import Alert, Incident

    h_ap = auth_header("approver")
    client.post(f"/api/v1/alerts/{first['id']}/approve", headers=h_ap)
    twin = db.get(Alert, uuid.UUID(first["id"]))
    clone = Alert(incident_id=twin.incident_id, level=twin.level, title=twin.title, body=twin.body,
                  language=twin.language, audience=twin.audience, channels=twin.channels, status="approved",
                  requires_approval=True, expires_at=twin.expires_at)
    db.add(clone)
    db.flush()
    queued, suppressed = service.enqueue(db, clone, db.get(Incident, twin.incident_id))
    db.commit()
    assert (queued, suppressed) == (0, 2)
    assert db.scalar(select(func.count()).select_from(Message)) == 2


def test_cancel_stops_queued_messages(client, incident_with_assessment, auth_header, db):
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"]).json()
    h_ap = auth_header("approver")
    client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=h_ap)
    assert client.post(f"/api/v1/alerts/{alert['id']}/cancel", headers=h_ap).json()["status"] == "cancelled"
    sms = MockAdapter("mock_sms")
    dispatch_all({"mock_sms": sms, "mock_whatsapp": MockAdapter("mock_whatsapp")})
    assert sms.sent == []


def test_disabled_channel_holds_messages_in_outbox(client, incident_with_assessment, auth_header, db):
    from dadip.db.models import ChannelConfig

    db.add(ChannelConfig(name="mock_sms", enabled=False, is_mock=True))
    db.commit()
    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"], channels=["mock_sms"]).json()
    client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=auth_header("approver"))
    sms = MockAdapter("mock_sms")
    dispatch_all({"mock_sms": sms})
    assert sms.sent == [] and db.scalar(select(Message.state)) == "queued"
    r = client.patch("/api/v1/channels/mock_sms", json={"enabled": True}, headers=auth_header("admin"))
    assert r.status_code == 200
    dispatch_all({"mock_sms": sms})
    assert len(sms.sent) == 1


def test_unavailable_channel_rejected(client, incident_with_assessment):
    inc, h_op = incident_with_assessment
    r = make_alert(client, h_op, inc["id"], channels=["telegram"])
    assert r.status_code == 422 and "not available" in r.text


def test_two_dispatchers_never_double_send(client, incident_with_assessment, auth_header, db):
    """FOR UPDATE SKIP LOCKED: concurrent workers split the outbox; each message is attempted exactly once."""
    inc, h_op = incident_with_assessment
    h_ap = auth_header("approver")
    for i in range(20):
        a = make_alert(client, h_op, inc["id"], audience=f"zone-{i}").json()
        client.post(f"/api/v1/alerts/{a['id']}/approve", headers=h_ap)
    shared = MockAdapter("mock_sms", latency_ms=5)
    wa = MockAdapter("mock_whatsapp", latency_ms=5)
    adapters = {"mock_sms": shared, "mock_whatsapp": wa}

    def worker():
        d = Dispatcher(adapters, rng=random.Random())
        with get_sessionmaker()() as s:
            while d.run_once(s, batch=3):
                pass

    threads = [threading.Thread(target=worker) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    sent_ids = [m.id for m in shared.sent + wa.sent]
    assert len(sent_ids) == 40 and len(set(sent_ids)) == 40
    assert db.scalar(select(func.count()).select_from(DeliveryAttempt)) == 40


# ---------- real adapters ----------

def test_mqtt_adapter_publishes_qos1_to_real_broker():
    received = []
    got = threading.Event()
    sub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"test-sub-{uuid.uuid4().hex[:6]}")
    sub.on_message = lambda c, u, m: (received.append((m.topic, json.loads(m.payload))), got.set())
    sub.connect("localhost", 1883)
    sub.subscribe("dadip/alerts/#", qos=1)
    sub.loop_start()
    time.sleep(0.3)
    adapter = MqttAdapter("localhost", 1883, client_id=f"test-pub-{uuid.uuid4().hex[:6]}")
    try:
        res = adapter.send(OutboundMessage(id=str(uuid.uuid4()), channel="mqtt", recipient="supaul",
                                           priority=90, payload={"title": "t", "body": "b"}))
        assert res.outcome == Outcome.success and res.provider_message_id.startswith("mid-")
        assert got.wait(3)
        assert received[0][0] == "dadip/alerts/supaul" and received[0][1]["title"] == "t"
    finally:
        adapter.close()
        sub.loop_stop()


def test_mqtt_adapter_reports_unreachable_broker_as_transient():
    adapter = MqttAdapter("localhost", 1, timeout_s=0.5, client_id=f"test-dead-{uuid.uuid4().hex[:6]}")
    try:
        res = adapter.send(OutboundMessage(id="x", channel="mqtt", recipient="r", priority=1, payload={}))
        assert res.outcome == Outcome.transient_error
    finally:
        adapter.close()


@pytest.mark.parametrize(("status", "expected"), [(200, Outcome.success), (503, Outcome.transient_error),
                                                  (429, Outcome.transient_error), (400, Outcome.permanent_error)])
def test_webhook_status_classification(status, expected):
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(status)))
    res = WebhookAdapter("https://partner.example.com/hook", client=client).send(
        OutboundMessage(id="m1", channel="webhook", recipient="p", priority=1, payload={}))
    assert res.outcome == expected


def test_ack_arriving_during_send_is_not_lost(client, incident_with_assessment, auth_header, db):
    """Regression (found in the end-to-end smoke test): a fast device acknowledges while the dispatcher still
    holds the row inside its transaction. The ack must wait for the lock, not miss the row."""
    from dadip.comms.adapters import SendResult
    from dadip.comms.dispatcher import acknowledge

    inc, h_op = incident_with_assessment
    alert = make_alert(client, h_op, inc["id"], channels=["mock_sms"]).json()
    client.post(f"/api/v1/alerts/{alert['id']}/approve", headers=auth_header("approver"))
    result = {}

    class AckingAdapter:
        name, is_mock, delivery_semantics = "mock_sms", True, "test"

        def send(self, msg):
            def ack():
                with get_sessionmaker()() as s:
                    result["changed"] = acknowledge(s, uuid.UUID(msg.id), via="test")
                    s.commit()

            t = threading.Thread(target=ack)
            t.start()
            time.sleep(0.3)  # the ack is now blocked on the dispatcher's row lock
            result["thread"] = t
            return SendResult(Outcome.success, 1.0, provider_message_id="x")

    with get_sessionmaker()() as s:
        Dispatcher({"mock_sms": AckingAdapter()}).run_once(s)
    result["thread"].join(5)
    assert result["changed"] is True
    m = db.scalar(select(Message))
    db.refresh(m)
    assert m.state == "acknowledged" and m.delivered_at is not None

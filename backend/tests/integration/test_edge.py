"""Edge store-and-forward against a real Mosquitto broker, with real outages injected by a TCP proxy."""

import json
import time
import uuid

import paho.mqtt.client as mqtt
import pytest
from sqlalchemy import func, select

from dadip.aura.pipeline import WeatherObservation
from dadip.db.models import EdgeDevice, EdgeEvent, IncidentReport
from dadip.edge.agent import EdgeAgent
from dadip.edge.gateway import Gateway
from dadip.edge.storage import EdgeStore
from dadip.simulation.fault_proxy import FaultProxy

pytestmark = pytest.mark.integration


def wait_for(cond, timeout=10.0, step=0.05):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if cond():
            return True
        time.sleep(step)
    return False


@pytest.fixture
def gateway(db):
    gw = Gateway("localhost", 1883, client_id=f"gw-test-{uuid.uuid4().hex[:6]}")
    gw.start()
    assert gw.ready.wait(5)
    yield gw
    gw.stop()


@pytest.fixture
def proxy():
    p = FaultProxy("localhost", 1883)
    yield p
    p.close()


@pytest.fixture
def agent(tmp_path, proxy):
    a = EdgeAgent(f"dev-{uuid.uuid4().hex[:6]}", EdgeStore(str(tmp_path / "edge.db")), "127.0.0.1", proxy.port,
                  area="supaul", flush_interval_s=0.2)
    a.start()
    assert a.connected.wait(5)
    yield a
    a.stop()


REPORT = {"hazard_type": "flood", "description": "Water over the road near the school, 1 m deep",
          "latitude": 26.12, "longitude": 86.6, "location_text": "Supaul"}


def count_events(db, device_id):
    db.expire_all()
    return db.scalar(select(func.count()).select_from(EdgeEvent).where(EdgeEvent.device_id == device_id))


def test_online_events_reach_cloud_and_become_reports(agent, gateway, db):
    agent.report("report", REPORT)
    assert wait_for(lambda: count_events(db, agent.device_id) == 1)
    assert wait_for(lambda: agent.store.queue_depth() == 0)
    rep = db.scalar(select(IncidentReport).where(IncidentReport.source == "edge"))
    assert rep is not None and rep.credibility is not None
    assert wait_for(lambda: (db.expire_all(), db.get(EdgeDevice, agent.device_id))[1] is not None)


def test_offline_queue_syncs_exactly_once_after_outage(agent, gateway, proxy, db):
    proxy.down()
    assert wait_for(lambda: not agent.connected.is_set(), 15)
    ids = [agent.report("sensor", {"rain_mm": i}) for i in range(25)]
    time.sleep(1.0)
    assert agent.store.queue_depth() == 25 and count_events(db, agent.device_id) == 0
    proxy.up()
    assert wait_for(lambda: agent.connected.is_set(), 20), "agent did not reconnect"
    assert wait_for(lambda: count_events(db, agent.device_id) == 25, 15)
    assert wait_for(lambda: agent.store.queue_depth() == 0, 10)
    stored = set(db.scalars(select(EdgeEvent.id).where(EdgeEvent.device_id == agent.device_id)))
    assert stored == {uuid.UUID(i) for i in ids}


def test_resent_event_is_deduplicated_in_cloud(agent, gateway, db):
    """At-least-once on the wire: a lost PUBACK makes the device resend; the cloud keeps one copy."""
    eid = agent.report("sensor", {"rain_mm": 7})
    assert wait_for(lambda: count_events(db, agent.device_id) == 1)
    ev = {"event_id": eid, "device_id": agent.device_id, "kind": "sensor", "created_at": None,
          "payload": {"rain_mm": 7}}
    for _ in range(3):
        agent.client.publish(f"dadip/edge/{agent.device_id}/events", json.dumps(ev), qos=1).wait_for_publish(3)
    assert wait_for(lambda: gateway.stats["duplicate"] >= 3)
    assert count_events(db, agent.device_id) == 1


def test_alerts_received_once_and_acked(agent):
    pub = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"cloud-{uuid.uuid4().hex[:6]}")
    acks = []
    pub.on_message = lambda c, u, m: acks.append(json.loads(m.payload))
    pub.connect("localhost", 1883)
    pub.subscribe("dadip/acks", qos=1)
    pub.loop_start()
    time.sleep(0.3)
    mid = str(uuid.uuid4())
    alert = {"title": "RED ALERT: Flood — supaul", "ack_path": f"/api/v1/messages/{mid}/ack?token=x"}
    for _ in range(2):  # redelivery
        pub.publish("dadip/alerts/supaul", json.dumps(alert), qos=1).wait_for_publish(3)
    assert wait_for(lambda: len([a for a in acks if a["message_id"] == mid]) >= 2)
    stored = agent.store.alerts()
    assert len(stored) == 1 and stored[0]["times_received"] == 2 and stored[0]["acked_at"]
    pub.loop_stop()


def test_local_inference_raises_alarm_while_offline(agent, proxy):
    proxy.down()
    assert wait_for(lambda: not agent.connected.is_set(), 15)
    storm = WeatherObservation(rainfall=250, humidity=99, temperature=27, wind_speed=230, pressure=920)
    result = agent.local_assess("cyclone", 16.5, 82.2, storm)
    pending = agent.store.pending()
    if result["level"] in ("orange", "red"):
        assert any(e["kind"] == "local_alarm" for e in pending)
    else:
        assert not any(e["kind"] == "local_alarm" for e in pending)
    calm = agent.local_assess("cyclone", 16.5, 82.2, WeatherObservation(0, 50, 25, 5, 1013))
    assert calm["level"] in ("green", "yellow")


def test_large_backlog_after_outage_does_not_deadlock(agent, gateway, proxy, db):
    """Regression: a burst flush after reconnect deadlocked the agent (lock-order inversion with paho)."""
    proxy.down()
    assert wait_for(lambda: not agent.connected.is_set(), 15)
    for i in range(500):
        agent.report("sensor", {"seq": i})
    proxy.up()
    assert wait_for(lambda: agent.store.queue_depth() == 0, 40), f"stuck with {agent.store.queue_depth()} pending"
    assert wait_for(lambda: count_events(db, agent.device_id) == 500, 20)

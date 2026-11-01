"""DADIP edge agent: offline-first incident ingestion and alert reception over MQTT.

    dadip-edge --device-id village-07 --db ./edge.db --host broker.example --region Supaul

Topics (all QoS 1):
  dadip/edge/<device>/events   device -> cloud   outbox events (reports, sensor readings, local alarms)
  dadip/edge/<device>/status   device -> cloud   retained status; broker publishes "offline" as last will
  dadip/alerts/<area>          cloud -> device   alerts from the communication engine
  dadip/acks                   device -> cloud   acknowledgement of a received alert

Store-and-forward: every event is written to SQLite first and marked synced only when the broker acknowledges
the publish (PUBACK). If the connection drops before that, the event is re-sent after reconnection; the cloud
drops the duplicate by event id. Delivery to the cloud is therefore at-least-once on the wire and exactly-once
in the database.
"""

import argparse
import json
import logging
import threading
import time
from datetime import UTC, datetime

import paho.mqtt.client as mqtt

from dadip.aura import pipeline
from dadip.edge.storage import EdgeStore

log = logging.getLogger("dadip.edge")


class EdgeAgent:
    def __init__(self, device_id: str, store: EdgeStore, host: str, port: int, area: str = "all",
                 username: str | None = None, password: str | None = None, flush_interval_s: float = 1.0):
        self.device_id = device_id
        self.store = store
        self.area = area
        self.flush_interval_s = flush_interval_s
        self.connected = threading.Event()
        self.disconnects = 0
        self.reconnected_at: list[float] = []
        # Lock rule: never call into paho while holding self._lock. Paho holds its own internal lock while it
        # runs on_publish, so the opposite order deadlocks (found by the outage test: a burst flush after
        # reconnect froze the agent).
        self._inflight: dict[int, str] = {}   # MQTT mid -> event id
        self._early_acks: set[int] = set()    # PUBACKs that arrived before flush() recorded the mid
        self._lock = threading.Lock()
        self._stop = threading.Event()

        c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"edge-{device_id}", clean_session=False)
        if username:
            c.username_pw_set(username, password)
        c.will_set(self._t("status"), json.dumps({"device_id": device_id, "status": "offline"}), qos=1, retain=True)
        c.reconnect_delay_set(min_delay=1, max_delay=8)
        c.on_connect = self._on_connect
        c.on_disconnect = self._on_disconnect
        c.on_publish = self._on_publish
        c.on_message = self._on_message
        self.client = c
        self._host, self._port = host, port

    def _t(self, leaf: str) -> str:
        return f"dadip/edge/{self.device_id}/{leaf}"

    # ---------- connectivity ----------
    def _on_connect(self, c, userdata, flags, rc, props=None):
        if rc.is_failure:
            return
        c.subscribe([(f"dadip/alerts/{self.area}", 1), ("dadip/alerts/all", 1)])
        self.connected.set()
        self.reconnected_at.append(time.monotonic())
        self.publish_status("online")
        log.info("edge connected", extra={"device": self.device_id, "pending": self.store.queue_depth()})

    def _on_disconnect(self, c, userdata, flags, rc, props=None):
        if self.connected.is_set():
            self.disconnects += 1
        self.connected.clear()
        with self._lock:
            self._inflight.clear()  # unacknowledged publishes stay unsynced and are re-sent after reconnect
            self._early_acks.clear()
        log.warning("edge disconnected", extra={"device": self.device_id})

    def _on_publish(self, c, userdata, mid, rc=None, props=None):
        with self._lock:
            eid = self._inflight.pop(mid, None)
            if eid is None:
                self._early_acks.add(mid)
        if eid:
            self.store.mark_synced(eid)

    # ---------- receiving alerts ----------
    def _on_message(self, c, userdata, m):
        try:
            payload = json.loads(m.payload)
            ack_path = payload["ack_path"]
            message_id = ack_path.split("/messages/")[1].split("/ack")[0]
        except (ValueError, KeyError, IndexError):
            log.warning("edge: unparseable alert", extra={"topic": m.topic})
            return
        first = self.store.record_alert(message_id, payload)
        # Ack every time (including redeliveries): the cloud may not have seen the earlier ack.
        c.publish("dadip/acks", json.dumps({"message_id": message_id, "device_id": self.device_id}), qos=1)
        self.store.mark_acked(message_id)
        if first:
            log.info("edge alert received", extra={"device": self.device_id, "title": payload.get("title")})

    # ---------- sending ----------
    def publish_status(self, status: str) -> None:
        self.client.publish(self._t("status"), json.dumps({
            "device_id": self.device_id, "status": status, "queue_depth": self.store.queue_depth(),
            "area": self.area, "at": datetime.now(UTC).isoformat()}), qos=1, retain=True)

    def report(self, kind: str, payload: dict) -> str:
        """Record an event locally. Works offline; it is uploaded when the link is up."""
        return self.store.add_event(kind, payload)

    def flush(self) -> int:
        if not self.connected.is_set():
            return 0
        sent = 0
        with self._lock:
            inflight = set(self._inflight.values())
        for ev in self.store.pending():
            if ev["id"] in inflight:
                continue
            body = json.dumps({"event_id": ev["id"], "device_id": self.device_id, "kind": ev["kind"],
                               "created_at": ev["created_at"], "payload": ev["payload"]})
            self.store.mark_attempt(ev["id"])
            info = self.client.publish(self._t("events"), body, qos=1)  # outside self._lock (see __init__)
            if info.rc != mqtt.MQTT_ERR_SUCCESS:
                break
            with self._lock:
                acked_already = info.mid in self._early_acks
                if acked_already:
                    self._early_acks.discard(info.mid)
                else:
                    self._inflight[info.mid] = ev["id"]
            if acked_already:
                self.store.mark_synced(ev["id"])
            sent += 1
        return sent

    # ---------- local inference ----------
    def local_assess(self, hazard: str, lat: float, lon: float, reading: pipeline.WeatherObservation) -> dict:
        """Run the AURA risk engine on a local sensor reading. If the level is orange or red, raise a local
        alarm event immediately (works with no cloud connection) and queue it for upload."""
        result = pipeline.assess(pipeline.build_input(hazard, lat, lon, reading))
        level = result["alert_level"]
        if level in ("orange", "red"):
            self.report("local_alarm", {"hazard": hazard, "level": level, "composite_risk":
                                        result["risk"]["compositeRisk"], "latitude": lat, "longitude": lon,
                                        "engine": result["model_version"]})
        return {"level": level, "composite_risk": result["risk"]["compositeRisk"],
                "decision": result["admissibility"]["decision"]}

    # ---------- lifecycle ----------
    def start(self) -> None:
        self.client.connect_async(self._host, self._port, keepalive=5)
        self.client.loop_start()
        threading.Thread(target=self._flusher, daemon=True).start()

    def _flusher(self) -> None:
        while not self._stop.is_set():
            try:
                self.flush()
            except Exception:
                log.exception("edge flush failed")
            self._stop.wait(self.flush_interval_s)

    def stop(self) -> None:
        self._stop.set()
        if self.connected.is_set():
            self.publish_status("offline")
        self.client.disconnect()
        self.client.loop_stop()


def main() -> None:
    from dadip.core.logging import configure_logging

    p = argparse.ArgumentParser(description="DADIP edge agent")
    p.add_argument("--device-id", required=True)
    p.add_argument("--db", default="edge.db")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=1883)
    p.add_argument("--area", default="all", help="alert area slug to subscribe to")
    a = p.parse_args()
    configure_logging()
    agent = EdgeAgent(a.device_id, EdgeStore(a.db), a.host, a.port, area=a.area)
    agent.start()
    try:
        while True:
            time.sleep(10)
            log.info("edge status", extra={"device": a.device_id, **agent.store.stats(),
                                           "connected": agent.connected.is_set()})
    except KeyboardInterrupt:
        agent.stop()


if __name__ == "__main__":
    main()

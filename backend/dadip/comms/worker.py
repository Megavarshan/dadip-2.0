"""Dispatcher worker process: `dadip-dispatcher`. Also listens for device acknowledgements on MQTT."""

import json
import logging
import signal
import time
import uuid

from dadip.comms.adapters import build_registry
from dadip.comms.dispatcher import Dispatcher, acknowledge, redis_publisher
from dadip.core.config import get_settings
from dadip.core.logging import configure_logging
from dadip.db.session import get_sessionmaker

log = logging.getLogger("dadip.dispatcher")


def start_ack_listener(settings) -> object | None:
    """Edge devices publish `{"message_id": ...}` to `dadip/acks`; each is recorded as an acknowledgement."""
    import paho.mqtt.client as mqtt

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="dadip-ack-listener")
    if settings.mqtt_username:
        client.username_pw_set(settings.mqtt_username, settings.mqtt_password)

    def on_connect(c, userdata, flags, rc, props=None):
        c.subscribe("dadip/acks", qos=1)

    def on_message(c, userdata, m):
        # paho swallows exceptions raised in callbacks, so every outcome is logged explicitly.
        try:
            mid = uuid.UUID(json.loads(m.payload)["message_id"])
        except (ValueError, KeyError, TypeError):
            log.warning("bad ack payload")
            return
        try:
            with get_sessionmaker()() as db:
                changed = acknowledge(db, mid, via="mqtt")
                db.commit()
            log.info("mqtt ack", extra={"message_id": str(mid), "changed": changed})
        except Exception:
            log.exception("mqtt ack failed", extra={"message_id": str(mid)})

    client.on_connect, client.on_message = on_connect, on_message
    try:
        client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=30)
        client.loop_start()
        return client
    except OSError:
        log.warning("ack listener: broker unreachable")
        return None


def main() -> None:
    configure_logging()
    settings = get_settings()
    adapters = build_registry(settings)
    log.info("dispatcher starting", extra={"channels": sorted(adapters)})
    d = Dispatcher(adapters, publish=redis_publisher(settings.redis_url))
    listener = start_ack_listener(settings) if "mqtt" in adapters else None
    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    Session = get_sessionmaker()
    while running:
        try:
            with Session() as db:
                n = d.run_once(db)
        except Exception:
            log.exception("dispatch loop error")
            n = 0
        if n == 0:
            time.sleep(0.5)
    if listener:
        listener.loop_stop()
    log.info("dispatcher stopped")


if __name__ == "__main__":
    main()

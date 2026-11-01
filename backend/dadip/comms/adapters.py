"""Channel adapters. Each adapter sends one message and classifies the result.

What "success" means differs per channel and is recorded as `delivery_semantics`:
- mock_*:   the mock decided the send succeeded (no real network involved)
- mqtt:     the broker acknowledged the QoS 1 publish (PUBACK) — accepted by the broker, not yet read by a device
- websocket: published to the live-update bus (Redis); connected dashboards receive it
- webhook:  the receiving HTTP endpoint answered 2xx
- telegram: the Telegram Bot API accepted the message (`ok: true`)
End-user acknowledgement is tracked separately (`messages.acknowledged_at`).
"""

import json
import logging
import random
import threading
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from dadip.comms.core import Outcome
from dadip.core.config import Settings

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutboundMessage:
    id: str
    channel: str
    recipient: str
    priority: int
    payload: dict


@dataclass(frozen=True)
class SendResult:
    outcome: Outcome
    latency_ms: float
    provider_message_id: str | None = None
    error: str | None = None


class Adapter(Protocol):
    name: str
    is_mock: bool
    delivery_semantics: str

    def send(self, msg: OutboundMessage) -> SendResult: ...


def _timed(fn):
    start = time.perf_counter()
    result = fn()
    return result, (time.perf_counter() - start) * 1000


class MockAdapter:
    """Stands in for SMS / WhatsApp gateways. Failure rate and latency are configurable and seeded so tests
    and demos are reproducible. It never contacts a real provider."""

    is_mock = True
    delivery_semantics = "mock: simulated provider acceptance"

    def __init__(self, name: str, failure_rate: float = 0.0, latency_ms: float = 0.0, seed: int = 0,
                 permanent_failure_rate: float = 0.0):
        self.name = name
        self.failure_rate = failure_rate
        self.permanent_failure_rate = permanent_failure_rate
        self.latency_ms = latency_ms
        self._rng = random.Random(seed)  # noqa: S311 - reproducible mock failures, not security
        self._lock = threading.Lock()
        self.sent: list[OutboundMessage] = []
        self.down = False

    def send(self, msg: OutboundMessage) -> SendResult:
        with self._lock:
            roll = self._rng.random()
        if self.latency_ms:
            time.sleep(self.latency_ms / 1000)
        if self.down:
            return SendResult(Outcome.transient_error, self.latency_ms, error="mock channel down")
        if roll < self.permanent_failure_rate:
            return SendResult(Outcome.permanent_error, self.latency_ms, error="mock invalid recipient")
        if roll < self.permanent_failure_rate + self.failure_rate:
            return SendResult(Outcome.transient_error, self.latency_ms, error="mock gateway error")
        self.sent.append(msg)
        return SendResult(Outcome.success, self.latency_ms, provider_message_id=f"mock-{msg.id[:8]}")


class MqttAdapter:
    """Publishes alerts to `dadip/alerts/<recipient>` with QoS 1 and waits for the broker's PUBACK."""

    is_mock = False
    delivery_semantics = "mqtt: broker PUBACK (QoS 1)"
    name = "mqtt"

    def __init__(self, host: str, port: int, username: str | None = None, password: str | None = None,
                 timeout_s: float = 5.0, client_id: str = "dadip-dispatcher"):
        import paho.mqtt.client as mqtt

        self.timeout_s = timeout_s
        self._client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id, clean_session=False)
        if username:
            self._client.username_pw_set(username, password)
        self._host, self._port = host, port
        self._connected = threading.Event()
        self._client.on_connect = lambda c, u, f, rc, p=None: self._connected.set() if not rc.is_failure else None
        self._client.on_disconnect = lambda *a, **k: self._connected.clear()
        self._client.reconnect_delay_set(1, 30)
        try:
            self._client.connect_async(host, port, keepalive=30)
            self._client.loop_start()
        except OSError as e:  # pragma: no cover - DNS failures etc.
            log.warning("mqtt connect failed", extra={"error": str(e)})

    def send(self, msg: OutboundMessage) -> SendResult:
        def go() -> SendResult:
            if not self._connected.wait(self.timeout_s):
                return SendResult(Outcome.transient_error, 0, error="broker unreachable")
            info = self._client.publish(f"dadip/alerts/{msg.recipient}", json.dumps(msg.payload), qos=1)
            try:
                info.wait_for_publish(self.timeout_s)
            except (RuntimeError, ValueError) as e:
                return SendResult(Outcome.transient_error, 0, error=f"publish failed: {e}")
            if not info.is_published():
                return SendResult(Outcome.timeout, 0, error="no PUBACK before timeout")
            return SendResult(Outcome.success, 0, provider_message_id=f"mid-{info.mid}")

        res, ms = _timed(go)
        return SendResult(res.outcome, ms, res.provider_message_id, res.error)

    def close(self) -> None:
        self._client.loop_stop()
        self._client.disconnect()


class WebSocketAdapter:
    """Fans an alert out to connected command-centre clients through the Redis live-update channel."""

    is_mock = False
    delivery_semantics = "websocket: published to live-update bus"
    name = "websocket"

    def __init__(self, redis_url: str, channel: str = "dadip:live"):
        import redis

        self._redis = redis.Redis.from_url(redis_url, socket_timeout=2, socket_connect_timeout=2)
        self._channel = channel

    def send(self, msg: OutboundMessage) -> SendResult:
        def go() -> SendResult:
            try:
                n = self._redis.publish(self._channel, json.dumps({"type": "alert", "message_id": msg.id,
                                                                   "payload": msg.payload}))
                return SendResult(Outcome.success, 0, provider_message_id=f"subscribers-{n}")
            except Exception as e:
                return SendResult(Outcome.transient_error, 0, error=f"redis: {type(e).__name__}")

        res, ms = _timed(go)
        return SendResult(res.outcome, ms, res.provider_message_id, res.error)


def _classify_http(status: int) -> Outcome:
    if 200 <= status < 300:
        return Outcome.success
    if status == 429 or status >= 500:
        return Outcome.transient_error
    return Outcome.permanent_error


class WebhookAdapter:
    """REST integration: POSTs the alert JSON to a partner agency endpoint."""

    is_mock = False
    delivery_semantics = "webhook: receiver answered 2xx"
    name = "webhook"

    def __init__(self, url: str, client: httpx.Client | None = None, timeout_s: float = 5.0):
        self.url = url
        self._client = client or httpx.Client(timeout=timeout_s)

    def send(self, msg: OutboundMessage) -> SendResult:
        def go() -> SendResult:
            try:
                r = self._client.post(self.url, json={"id": msg.id, "recipient": msg.recipient, **msg.payload},
                                      headers={"Idempotency-Key": msg.id})
                err = None if r.is_success else f"HTTP {r.status_code}"
                return SendResult(_classify_http(r.status_code), 0, error=err)
            except httpx.TimeoutException:
                return SendResult(Outcome.timeout, 0, error="timeout")
            except httpx.HTTPError as e:
                return SendResult(Outcome.transient_error, 0, error=type(e).__name__)

        res, ms = _timed(go)
        return SendResult(res.outcome, ms, res.provider_message_id, res.error)


class TelegramAdapter:
    """Real channel when DADIP_TELEGRAM_BOT_TOKEN is set. Recipient is a chat id."""

    is_mock = False
    delivery_semantics = "telegram: Bot API accepted (ok=true)"
    name = "telegram"

    def __init__(self, token: str, client: httpx.Client | None = None, timeout_s: float = 8.0):
        self._url = f"https://api.telegram.org/bot{token}/sendMessage"
        self._client = client or httpx.Client(timeout=timeout_s)

    def send(self, msg: OutboundMessage) -> SendResult:
        def go() -> SendResult:
            text = f"{msg.payload.get('title', '')}\n\n{msg.payload.get('body', '')}"[:4000]
            try:
                r = self._client.post(self._url, json={"chat_id": msg.recipient, "text": text})
                data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
                if r.is_success and data.get("ok"):
                    return SendResult(Outcome.success, 0, provider_message_id=str(data["result"]["message_id"]))
                return SendResult(_classify_http(r.status_code), 0, error=str(data.get("description", r.status_code)))
            except httpx.TimeoutException:
                return SendResult(Outcome.timeout, 0, error="timeout")
            except httpx.HTTPError as e:
                return SendResult(Outcome.transient_error, 0, error=type(e).__name__)

        res, ms = _timed(go)
        return SendResult(res.outcome, ms, res.provider_message_id, res.error)


def build_registry(settings: Settings) -> dict[str, Adapter]:
    """Adapters for the channels that are enabled AND have what they need. A channel without credentials is
    simply absent; it is never silently replaced by a mock."""
    reg: dict[str, Adapter] = {}
    enabled = set(settings.enabled_channels)
    if "mock_sms" in enabled:
        reg["mock_sms"] = MockAdapter("mock_sms", failure_rate=0.02, seed=1)
    if "mock_whatsapp" in enabled:
        reg["mock_whatsapp"] = MockAdapter("mock_whatsapp", failure_rate=0.02, seed=2)
    if "mqtt" in enabled:
        reg["mqtt"] = MqttAdapter(settings.mqtt_host, settings.mqtt_port, settings.mqtt_username,
                                  settings.mqtt_password)
    if "websocket" in enabled:
        reg["websocket"] = WebSocketAdapter(settings.redis_url)
    if settings.webhook_url:
        reg["webhook"] = WebhookAdapter(settings.webhook_url)
    if settings.telegram_bot_token:
        reg["telegram"] = TelegramAdapter(settings.telegram_bot_token)
    return reg

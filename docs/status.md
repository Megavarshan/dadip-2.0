# Feature status

**Implemented** = code exists and a test or command verifies it. **Simulated** = runs, but against mock
providers or simulated networks. **Planned** = not built yet.

| Capability | Status | Verified by |
| --- | --- | --- |
| Auth: login, citizen self-registration, JWT, 4 roles | Implemented | `tests/integration/test_api_foundation.py` |
| Incidents API with validation | Implemented | same |
| Public report submission, rate-limited, contact hidden | Implemented | same |
| Audit log for every mutation | Implemented | same |
| Schema migrations | Implemented | `alembic check`, test suite migrates from scratch |
| AURA assessment (port of original heuristics) | Implemented | `tests/unit/test_aura_parity.py` (304 + 441 cases vs original TS) |
| AURA reproducible inputs, provenance, sensitivity uncertainty | Implemented | `tests/unit/test_aura_pipeline.py`, `tests/integration/test_aura_api.py` |
| Report credibility v0 (heuristic) | Implemented, not evaluated | same |
| Live weather (Open-Meteo) | Implemented, live call not yet verified | mocked HTTP tests |
| Approval workflow (AURA policy, four-eyes, reject, cancel) | Implemented | `tests/integration/test_comms.py` |
| Communication engine: priority, retry/backoff, dedup, TTL, outbox, attempts, acks | Implemented | `tests/unit/test_comms_core.py`, `tests/integration/test_comms.py`, end-to-end smoke run |
| MQTT channel (QoS 1, real Mosquitto) + MQTT acks | Implemented | `test_mqtt_adapter_publishes_qos1_to_real_broker`, smoke run |
| WebSocket live feed, webhook channel | Implemented | webhook: mocked HTTP tests; WebSocket endpoint not yet exercised by a client test |
| Multilingual alert headers (en / hi / ta) | Implemented, needs native-speaker review | `test_full_lifecycle_approve_dispatch_ack` |
| Telegram channel | Implemented, not verified (no bot token configured) | |
| SMS / WhatsApp | Mock only, labelled `is_mock` in stats | |
| Edge agent: SQLite outbox, MQTT QoS 1, offline queue, reconnect, local inference, alert inbox + acks | Implemented | `tests/integration/test_edge.py` (real Mosquitto, outages injected by TCP proxy) |
| Edge gateway: idempotent ingestion, device status, edge reports scored | Implemented | same |
| Network degradation experiments | Planned (Phase 7) | |
| Command centre on live API | Planned (Phase 6) | |
| Docker Compose stack | Written, not yet run | |

# Development log

Newest entries first. Every "verified" claim names the command that verified it.

## 2026-11-01 — Phase 6: command centre

**Done**

- Replaced the mock-driven dashboards with a command centre on the FastAPI backend: overview, incidents with AURA
  assessment view (provenance and uncertainty), alerts with approval, communication monitoring, edge devices,
  audit log, experiment results. Public portal with map, help centres and report form, keeping the original
  5-language UI strings.
- Backend-for-frontend: login stores the JWT in an httpOnly cookie; `/api/backend/*` forwards to FastAPI;
  `proxy.ts` guards `/command`.
- Removed in-browser mock services, Supabase client, NextAuth with hard-coded demo users, and 135 unused packages.
  Removed unsupported claims ("reduces unsafe decisions by 46%", RAG, transformers) from the landing page and
  metadata; the landing page now quotes the committed simulation results, labelled as simulated.
- Backend: client IP from `X-Forwarded-For` only from trusted proxies or with a shared secret; `/channels` says
  whether each channel is configured.

**Verified**

- `pytest`: 392 passed. `npm ci`, `tsc --noEmit`, `eslint src` (0 errors), `next build`: pass.
- Playwright + Chrome against the real stack (API, dispatcher, edge gateway, edge agent, Next production server):
  citizen report submitted from the Tamil UI → operator ran AURA (ABSTAIN) and created an alert → approver
  approved → SMS (mock) delivered and MQTT acknowledged by the edge device. Screenshots reviewed.

**Found by looking at the screens, fixed**

- Telegram and webhook were shown as REAL and offered for alerts without credentials; now "NOT CONFIGURED" and
  hidden from the alert form.

## 2026-11-01 — Phase 7: communication experiments

**Done**

- Discrete-event simulator on the shared comms core; experiment runner with bootstrap CIs and paired
  differences; figure generator; circuit breaker added to the core and the live dispatcher.
- Ran 630 runs (7 scenarios × 3 strategies × 30 seeds) in 156 s; results committed in `simulation-results/v1`.

**Results** (simulated; details and caveats in `docs/research/communication-results.md`)

- Resilient: 100% timely delivery in all scenarios; baseline 72.5–99.1%.
- Under congestion priority scheduling cut red-alert p95 latency from 284.6 s to 0.67 s.
- Reliability costs tail latency on alerts others drop (red p95 89 s during a 120 s outage).

**Defects found by the experiment**

- Breaker probes exhausted red alerts' retry budget during outages → failures while the channel is down no
  longer consume budget (simulator and live dispatcher).
- Float-boundary livelock in breaker probe timing → tolerance and strictly advancing wake-ups.

## 2026-11-01 — Phase 5: edge intelligence

**Done**

- Edge agent (`dadip-edge`): SQLite outbox and alert inbox, MQTT QoS 1 upload marked synced on PUBACK,
  last-will offline status, automatic reconnection, local AURA risk inference that raises a local alarm offline,
  alert reception with deduplicated inbox and MQTT acks.
- Edge gateway (`dadip-edge-gateway`): idempotent ingestion by device event id, device status, edge reports
  turned into scored incident reports. API: `/edge/devices`, `/edge/events`.
- `FaultProxy`: TCP proxy that takes a real MQTT link down and up for outage tests.

**Verified**

- `pytest tests/integration/test_edge.py`: 6 passed, 5 consecutive runs. 25 events queued during an outage arrive
  exactly once after restoration; a 500-event backlog drains after reconnect; re-sent events are dropped by the
  cloud; redelivered alerts are stored once and acked each time.
- Full suite: 376 passed.

**Bug found and fixed**

- Lock-order deadlock in the edge agent: the flusher held the agent lock while calling paho `publish`, and paho
  held its internal lock while calling `on_publish`, which needed the agent lock. It froze the agent on the first
  burst flush after a reconnect. Found by the outage test, diagnosed with a `py-spy` stack dump, fixed by never
  calling paho under the agent lock. Regression: `test_large_backlog_after_outage_does_not_deadlock`.
- Added `pytest-timeout` (thread method) so a hang fails with stack traces instead of stalling CI.

## 2026-11-01 — Phases 3–4: communication engine

**Done**

- Pure scheduling core (`dadip/comms/core.py`) with the three research strategies; shared by the live
  dispatcher and the upcoming simulator.
- Adapters: mock SMS / WhatsApp, MQTT (QoS 1), WebSocket (Redis), webhook, Telegram.
- PostgreSQL outbox dispatcher with `SKIP LOCKED`, attempts and lifecycle events; `dadip-dispatcher` worker
  with an MQTT acknowledgement listener.
- Alert workflow: AURA-driven approval policy, four-eyes approval, reject, cancel, dedup, TTL, HMAC ack links,
  English / Hindi / Tamil headers. Endpoints for alerts, messages, delivery stats, channels, live WebSocket.

**Verified**

- `pytest`: 370 passed (17 new communication integration tests against PostgreSQL and Mosquitto).
- End-to-end run with real processes (uvicorn API, `dadip-dispatcher`, Mosquitto, an MQTT subscriber acting as
  an edge device): approve → MQTT delivery → device ack recorded in 0.4 s; no errors logged.

**Bug found by the end-to-end run, fixed with a regression test**

- MQTT acks were silently lost when a device answered before the dispatcher committed: the ack `UPDATE` did not
  match the still-`queued` row, so PostgreSQL skipped it instead of waiting for the lock.
  Test: `test_ack_arriving_during_send_is_not_lost`.

**Not yet verified**

- Telegram (no bot token), live WebSocket endpoint with a browser client.

## 2026-11-01 — Phase 2: AURA

**Done**

- Ported the five AURA engines to Python (`dadip/aura/engines.py`), behaviour-identical to the original.
- Parity harness: Node runs the original TypeScript on seeded inputs; fixture in `tests/fixtures/`.
- AURA 2.0 pipeline: deterministic inputs with provenance, sensitivity-based uncertainty, corrected OOD test,
  approval policy. Credibility v0 for reports. Open-Meteo client at the incident location.
- API: `POST /incidents/{id}/assess`, `GET /incidents/{id}/assessments`; reports scored on submit.

**Verified**

- `pytest`: 341 passed (incl. 304 pipeline + 441 admissibility-grid parity cases against the original).

**Findings** (details in `docs/research/aura.md`)

- The original admissibility score never exceeds 0.48 from real inputs (global optimisation), so `execute`
  (≥ 0.55) is unreachable; every alert therefore goes to a human approver.
- The original OOD threshold (16.92) is χ²₉ on the squared scale but is compared with the unsquared distance.
- Port bug caught by parity tests: `floor(x + 0.5)` differs from JavaScript `Math.round` at 0.49999999999999994.

**Not yet verified**

- A live Open-Meteo request (blocked from the sandbox).

## 2026-11-01 — Phase 1: foundation

**Done**

- Repository restructured: Next.js app → `frontend/`, original agent and SQL → `legacy/`, history preserved.
- Backend skeleton (FastAPI, Pydantic v2, SQLAlchemy 2, psycopg 3): settings from environment, JSON logs with
  request ids, argon2id password hashing, JWT access tokens, four roles with rank-based gates.
- Data model for all planned entities (15 tables) with CHECK constraints, foreign keys and indexes.
- Alembic migration `0001` generated from the models and reviewed.
- API: health (live / ready), auth (login, register-as-citizen, me, admin role change), incidents
  (list / get / create / patch), reports (public rate-limited submit, operator list / verify), resources,
  audit log. Every mutation is audited in the same transaction.
- Seed script: admin from env or generated password, labelled demo incidents and resources from original seed.
- Docker Compose (postgres, redis, mosquitto, migrate, api), backend Dockerfile, `.env.example`, CI workflow.

**Verified**

- `alembic upgrade head` → `downgrade base` → `upgrade head` on PostgreSQL 16; `alembic check` reports no drift.
- A row with an invalid hazard type is rejected by the database (`ck_incidents_hazard`).
- `pytest`: 11 integration tests pass against real PostgreSQL 16 and Redis 7.
- `ruff check .`: clean.

**Not yet verified**

- `docker compose up` (no Docker daemon in the development sandbox).
- The GitHub Actions workflow (first run happens on push).

**Fixed during the phase**

- Seed script accepted an empty `DADIP_SEED_ADMIN_PASSWORD` as the password; empty is now treated as unset.
- Login rejected valid accounts on reserved domains because it validated email format; login now only matches.

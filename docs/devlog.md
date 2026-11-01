# Development log

Newest entries first. Every "verified" claim names the command that verified it.

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

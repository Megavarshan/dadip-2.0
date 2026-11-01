# Development log

Newest entries first. Every "verified" claim names the command that verified it.

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

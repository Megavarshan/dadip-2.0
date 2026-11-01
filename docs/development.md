# Development guide

## Services

The backend needs PostgreSQL 16, Redis 7 and an MQTT broker (Mosquitto 2).

- **Docker:** `docker compose up postgres redis mosquitto`
- **Native:** any local installation works; defaults expect `dadip:dadip@localhost:5432`.

Create the databases once:

```sql
CREATE USER dadip PASSWORD 'dadip' CREATEDB;
CREATE DATABASE dadip OWNER dadip;
CREATE DATABASE dadip_test OWNER dadip;
```

## Migrations

Schema changes go through Alembic only.

```bash
cd backend
alembic revision --autogenerate -m "describe change"   # then review the generated file
alembic upgrade head
alembic check                                         # models and migrations agree
```

Migrations are never run implicitly on API start-up; Compose runs them in the one-shot `migrate` service.

## Tests

```bash
cd backend && pytest
```

- `tests/unit/` — pure logic, no services.
- `tests/integration/` — real PostgreSQL (and Redis / Mosquitto where marked). The suite migrates the
  `dadip_test` database from scratch using the real migrations, then truncates tables between tests.
  Override with `DADIP_TEST_DATABASE_URL`.

## Conventions

- API under `/api/v1`, OpenAPI at `/api/docs`; list endpoints return `{items, total, limit, offset}`.
- Every state-changing endpoint writes an `audit_events` row in the same transaction.
- Roles, lowest to highest: `citizen`, `operator`, `approver`, `admin`; a higher role includes lower ones.
- Logs are JSON lines on stdout; each response carries an `x-request-id` header.
- Lint: `ruff check .` (backend), `npx tsc --noEmit` (frontend).

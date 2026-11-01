# DADIP 2.0

**Distributed AI-Driven Disaster Intelligence and Resilient Communication Platform**

DADIP 2.0 is the successor to [DADIP](https://github.com/Megavarshan/disaster-ai), rebuilt as an AI-driven,
cloud-edge disaster intelligence and resilient communication framework. The original repository is the frozen
reference baseline and is never modified from here.

> **Status: under active development (alpha).** This README lists only what exists and has been verified.
> See [`docs/devlog.md`](docs/devlog.md) for progress and [`docs/status.md`](docs/status.md) for the
> implemented / simulated / planned matrix.

## Subsystems

| Subsystem | Responsibility | Where |
| --- | --- | --- |
| AURA Intelligence Engine | Risk, reliability, distribution shift, decision admissibility | `backend/dadip/aura/` |
| Cloud Intelligence Core | FastAPI, PostgreSQL, Redis, workers, audit | `backend/dadip/` |
| Resilient Communication Engine | Prioritised, retried, deduplicated, tracked delivery | `backend/dadip/comms/` |
| Edge Intelligence Network | Offline-first edge agent over MQTT | `backend/dadip/edge/` |
| Disaster Command Centre | Operator dashboard | `frontend/` |
| Network simulation | Reproducible comparison of delivery strategies | `backend/dadip/simulation/` |

## Quick start (local services)

Requirements: Python 3.12+, PostgreSQL 16, Redis 7, Mosquitto 2 (or Docker Compose).

```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
cp ../.env.example ../.env          # set DADIP_JWT_SECRET
alembic upgrade head
python -m dadip.seed --admin-email you@example.com --demo
uvicorn dadip.main:app --reload     # API docs: http://localhost:8000/api/docs
pytest                              # needs the dadip_test database, see docs/development.md
```

With Docker: `cp .env.example .env && docker compose up --build`.

## Repository layout

```
backend/        FastAPI app, AURA, communication engine, edge agent, simulator, migrations, tests
frontend/       Next.js command centre (inherited from DADIP, being migrated to the new API)
legacy/         Original Python agent and Supabase SQL, kept for reference only
infrastructure/ Broker and deployment configuration
docs/           Architecture, development, research and the development log
```

## Honesty rules this project follows

- Demo, simulated, historical and live data are labelled as such in the database (`data_origin`) and the UI.
- A channel is reported as delivering real messages only when its provider is configured and delivery verified.
- Every performance number in the docs is produced by a script in this repository, with its seed and config.

## Credits

Original DADIP by **Megavarshan A** (B.Tech AI, SRM Institute of Science and Technology).
Licensed under Apache 2.0.

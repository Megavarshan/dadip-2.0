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
| Disaster Command Centre | Operator console and public portal on the live API | `frontend/` |
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

Background workers (separate terminals):

```bash
dadip-dispatcher          # sends approved alerts, records attempts, listens for MQTT acks
dadip-edge-gateway        # ingests edge device events
dadip-edge --device-id demo-01 --area supaul-district   # optional simulated edge device
```

Command centre:

```bash
cd frontend && npm ci
DADIP_API_URL=http://localhost:8000 npm run dev        # http://localhost:3000/command
```

Experiments: `dadip-sim --seeds 30 --out ../simulation-results/latest` (see `docs/research/`).

With Docker: `cp .env.example .env && docker compose up --build` (backend services; not yet verified, see status).

## Repository layout

```
backend/        FastAPI app, AURA, communication engine, edge agent, simulator, migrations, tests
frontend/       Next.js command centre and public portal (backend-for-frontend proxy to FastAPI)
legacy/         Original Python agent and Supabase SQL, kept for reference only
infrastructure/ Broker and deployment configuration
docs/           Architecture, development, research and the development log
```

## Key documents

- [`docs/research/communication-results.md`](docs/research/communication-results.md) — experiment results and limits
- [`docs/research/aura.md`](docs/research/aura.md) — what AURA is, parity verification, findings
- [`docs/architecture/communication.md`](docs/architecture/communication.md) — alert lifecycle and guarantees
- [`docs/status.md`](docs/status.md) — implemented / simulated / planned, with the test that verifies each

## Honesty rules this project follows

- Demo, simulated, historical and live data are labelled as such in the database (`data_origin`) and the UI.
- A channel is reported as delivering real messages only when its provider is configured and delivery verified.
- Every performance number in the docs is produced by a script in this repository, with its seed and config.

## Credits

Original DADIP by **Megavarshan A** (B.Tech AI, SRM Institute of Science and Technology).
Licensed under Apache 2.0.

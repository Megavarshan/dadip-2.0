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
| AURA assessment | Planned (Phase 2) | |
| Approval workflow | Planned (Phase 2) | |
| Communication engine (priority, retry, dedup, TTL) | Planned (Phase 3–4) | |
| Real channels (Telegram) | Planned, optional | |
| SMS / WhatsApp | Planned as mock only | |
| MQTT edge agent | Planned (Phase 5) | |
| Network degradation experiments | Planned (Phase 7) | |
| Command centre on live API | Planned (Phase 6) | |
| Docker Compose stack | Written, not yet run | |

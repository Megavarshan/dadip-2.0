# Working rules for this repository

- `Megavarshan/disaster-ai` is the frozen baseline. Never push to it.
- Commit as `Megavarshan <ma8711@srmist.edu.in>`; no co-author trailers.
- Never claim a feature works until a test or command shows it; record that command in `docs/devlog.md`.
- Never fabricate metrics. Every number in docs comes from a script in `backend/dadip/simulation` or a test.
- Label data provenance (`data_origin`: live, report, manual, demo, simulated) and mock channels everywhere.
- Schema changes only through Alembic; every mutating endpoint writes an audit row in the same transaction.
- High-impact alerts never dispatch without an approver.
- Backend: `cd backend && ruff check . && pytest`. Frontend: `cd frontend && npx tsc --noEmit`.

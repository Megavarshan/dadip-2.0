# Inherited components

DADIP 2.0 keeps the full Git history of the original DADIP (51 commits up to `7342155`). The original
repository, `Megavarshan/disaster-ai`, is the immutable baseline and is never pushed to from here.

| Original location | DADIP 2.0 location | Status |
| --- | --- | --- |
| `src/`, `public/`, Next.js config | `frontend/` | Moved unchanged; being migrated from in-browser mock data to the new API |
| `src/lib/engines/index.ts` (AURA heuristics) | `backend/dadip/aura/` | Ported to Python with parity tests against the original TypeScript |
| `src/lib/services/index.ts` (USGS, EONET, Open-Meteo fetchers) | backend ingestion | To be ported; mock generators are not carried over into runtime |
| `supabase/schema.sql`, `seed.sql` | `legacy/supabase/` | Reference only; superseded by `backend/migrations` |
| `agent/aura_agent.py` | `legacy/aura-agent/` | Reference only; chat prompt contract to be reused behind an optional LLM provider |
| `agent/__pycache__`, `agent/dadip_aura.db` | removed | Build artefacts / unused database |

Removed on purpose (see the Phase 0 audit): hard-coded demo credentials, permissive RLS policies, and
hard-coded research percentages that no code in the original repository produced.

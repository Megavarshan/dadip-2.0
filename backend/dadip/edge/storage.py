"""Edge-local persistence (SQLite). Survives process restarts and works with no network."""

import json
import sqlite3
import threading
import uuid
from datetime import UTC, datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,           -- generated on the device; the cloud uses it to drop duplicates
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT                 -- set when the broker acknowledges (PUBACK)
);
CREATE INDEX IF NOT EXISTS ix_outbox_pending ON outbox(synced_at, created_at);
CREATE TABLE IF NOT EXISTS inbox (
    message_id TEXT PRIMARY KEY,   -- one row per alert message, however often it is redelivered
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL,
    times_received INTEGER NOT NULL DEFAULT 1,
    acked_at TEXT
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


class EdgeStore:
    def __init__(self, path: str):
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.executescript(SCHEMA)
        self._lock = threading.Lock()

    def add_event(self, kind: str, payload: dict) -> str:
        eid = str(uuid.uuid4())
        with self._lock:
            self._db.execute("INSERT INTO outbox(id, kind, payload, created_at) VALUES (?,?,?,?)",
                             (eid, kind, json.dumps(payload), _now()))
        return eid

    def pending(self, limit: int = 100) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT id, kind, payload, created_at FROM outbox WHERE synced_at IS NULL "
                                    "ORDER BY created_at LIMIT ?", (limit,)).fetchall()
        return [{"id": r[0], "kind": r[1], "payload": json.loads(r[2]), "created_at": r[3]} for r in rows]

    def mark_attempt(self, eid: str) -> None:
        with self._lock:
            self._db.execute("UPDATE outbox SET publish_attempts = publish_attempts + 1 WHERE id = ?", (eid,))

    def mark_synced(self, eid: str) -> None:
        with self._lock:
            self._db.execute("UPDATE outbox SET synced_at = ? WHERE id = ? AND synced_at IS NULL", (_now(), eid))

    def queue_depth(self) -> int:
        with self._lock:
            return self._db.execute("SELECT count(*) FROM outbox WHERE synced_at IS NULL").fetchone()[0]

    def record_alert(self, message_id: str, payload: dict) -> bool:
        """Store a received alert. Returns True the first time, False for a redelivery."""
        with self._lock:
            cur = self._db.execute("INSERT INTO inbox(message_id, payload, received_at) VALUES (?,?,?) "
                                   "ON CONFLICT(message_id) DO UPDATE SET times_received = times_received + 1",
                                   (message_id, json.dumps(payload), _now()))
            first = self._db.execute("SELECT times_received FROM inbox WHERE message_id = ?",
                                     (message_id,)).fetchone()[0] == 1
        return bool(cur) and first

    def mark_acked(self, message_id: str) -> None:
        with self._lock:
            self._db.execute("UPDATE inbox SET acked_at = ? WHERE message_id = ?", (_now(), message_id))

    def alerts(self) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT message_id, payload, times_received, acked_at FROM inbox "
                                    "ORDER BY received_at").fetchall()
        return [{"message_id": r[0], "payload": json.loads(r[1]), "times_received": r[2], "acked_at": r[3]}
                for r in rows]

    def stats(self) -> dict:
        with self._lock:
            total, synced, attempts = self._db.execute(
                "SELECT count(*), count(synced_at), coalesce(sum(publish_attempts),0) FROM outbox").fetchone()
        return {"events": total, "synced": synced, "pending": total - synced, "publish_attempts": attempts}

    def close(self) -> None:
        self._db.close()

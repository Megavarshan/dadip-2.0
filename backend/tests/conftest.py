"""Test harness. Integration tests run against a real PostgreSQL database named by DADIP_TEST_DATABASE_URL
(default: local `dadip_test`). The schema is built with the real Alembic migrations, not create_all, so the
migrations themselves are tested."""

import os

os.environ.setdefault("DADIP_ENV", "test")
os.environ.setdefault(
    "DADIP_DATABASE_URL",
    os.environ.get("DADIP_TEST_DATABASE_URL", "postgresql+psycopg://dadip:dadip@localhost:5432/dadip_test"),
)
os.environ.setdefault("DADIP_PUBLIC_REPORT_RATE_PER_MINUTE", "1000")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from dadip.core.config import get_settings  # noqa: E402
from dadip.core.security import hash_password  # noqa: E402
from dadip.db.models import Base, User  # noqa: E402
from dadip.db.session import get_engine, get_sessionmaker  # noqa: E402

BACKEND = os.path.dirname(os.path.dirname(__file__))


@pytest.fixture(scope="session")
def migrated_db():
    cfg = Config(os.path.join(BACKEND, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(BACKEND, "migrations"))
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield get_settings().database_url


@pytest.fixture
def db(migrated_db):
    session = get_sessionmaker()()
    yield session
    session.close()
    tables = ", ".join(t.name for t in reversed(Base.metadata.sorted_tables))
    with get_engine().begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client(db):
    from dadip.main import create_app

    with TestClient(create_app()) as c:
        yield c


PASSWORD = "correct-horse-battery"  # noqa: S105 - test fixture only


@pytest.fixture
def make_user(db):
    def _make(role: str = "citizen", email: str | None = None) -> User:
        user = User(email=email or f"{role}@example.com", name=role.title(), password_hash=hash_password(PASSWORD),
                    role=role)
        db.add(user)
        db.commit()
        return user

    return _make


@pytest.fixture
def auth_header(client, make_user):
    def _auth(role: str) -> dict[str, str]:
        user = make_user(role)
        r = client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    return _auth

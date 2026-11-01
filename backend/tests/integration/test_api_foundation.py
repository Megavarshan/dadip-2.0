import pytest

from tests.conftest import PASSWORD

pytestmark = pytest.mark.integration

INCIDENT = {"hazard_type": "flood", "title": "River overflow near Supaul", "severity": "high",
            "latitude": 26.12, "longitude": 86.6, "region": "Bihar"}
REPORT = {"reporter_name": "Test Citizen", "contact": "+91-9000000000", "hazard_type": "flood",
          "description": "Water entering houses on the east bank", "latitude": 26.1, "longitude": 86.6,
          "location_text": "Supaul, Bihar", "reported_severity": "high"}


def test_health(client):
    assert client.get("/api/v1/health/live").json()["status"] == "ok"
    r = client.get("/api/v1/health/ready")
    assert r.status_code == 200
    assert r.json()["checks"]["database"] == "ok"


def test_login_success_and_failure(client, make_user):
    user = make_user("operator")
    ok = client.post("/api/v1/auth/login", json={"email": user.email, "password": PASSWORD})
    assert ok.status_code == 200 and ok.json()["user"]["role"] == "operator"
    bad = client.post("/api/v1/auth/login", json={"email": user.email, "password": "wrong"})
    assert bad.status_code == 401
    unknown = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert unknown.status_code == 401


def test_register_always_creates_citizen(client):
    r = client.post("/api/v1/auth/register",
                    json={"email": "new@example.com", "name": "New", "password": "long-enough-pass", "role": "admin"})
    assert r.status_code == 201
    assert r.json()["user"]["role"] == "citizen"
    dup = client.post("/api/v1/auth/register",
                      json={"email": "NEW@example.com", "name": "New", "password": "long-enough-pass"})
    assert dup.status_code == 409


def test_role_gates(client, auth_header):
    assert client.post("/api/v1/incidents", json=INCIDENT).status_code == 401
    assert client.post("/api/v1/incidents", json=INCIDENT, headers=auth_header("citizen")).status_code == 403
    r = client.post("/api/v1/incidents", json=INCIDENT, headers=auth_header("operator"))
    assert r.status_code == 201
    assert r.json()["data_origin"] == "manual"


def test_invalid_token_rejected(client):
    r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_incident_validation(client, auth_header):
    h = auth_header("operator")
    bad = dict(INCIDENT, latitude=123)
    assert client.post("/api/v1/incidents", json=bad, headers=h).status_code == 422
    bad = dict(INCIDENT, hazard_type="meteor")
    assert client.post("/api/v1/incidents", json=bad, headers=h).status_code == 422


def test_incident_list_and_patch(client, auth_header):
    h = auth_header("operator")
    created = client.post("/api/v1/incidents", json=INCIDENT, headers=h).json()
    page = client.get("/api/v1/incidents?status=open").json()
    assert page["total"] == 1 and page["items"][0]["id"] == created["id"]
    r = client.patch(f"/api/v1/incidents/{created['id']}", json={"status": "closed"}, headers=h)
    assert r.status_code == 200 and r.json()["status"] == "closed"
    assert client.get("/api/v1/incidents?status=open").json()["total"] == 0


def test_public_report_hides_contact_and_operator_sees_it(client, auth_header):
    r = client.post("/api/v1/reports", json=REPORT)
    assert r.status_code == 201
    assert "contact" not in r.json() and "reporter_name" not in r.json()
    assert r.json()["status"] == "pending"
    assert client.get("/api/v1/reports").status_code == 401
    page = client.get("/api/v1/reports", headers=auth_header("operator")).json()
    assert page["items"][0]["contact"] == REPORT["contact"]


def test_report_verification_records_verifier_and_audit(client, auth_header, db):
    rid = client.post("/api/v1/reports", json=REPORT).json()["id"]
    h_op = auth_header("operator")
    r = client.patch(f"/api/v1/reports/{rid}", json={"status": "verified"}, headers=h_op)
    assert r.status_code == 200 and r.json()["status"] == "verified"
    h_admin = auth_header("admin")
    actions = [e["action"] for e in client.get("/api/v1/audit", headers=h_admin).json()["items"]]
    assert "UPDATE_REPORT" in actions and "SUBMIT_REPORT" in actions
    assert client.get("/api/v1/audit", headers=h_op).status_code == 403


def test_admin_sets_role(client, auth_header, make_user):
    target = make_user("citizen", email="promote@example.com")
    r = client.patch(f"/api/v1/auth/users/{target.id}/role", json={"role": "approver"},
                     headers=auth_header("admin"))
    assert r.status_code == 200 and r.json()["role"] == "approver"


def test_public_report_rate_limit(client, monkeypatch):
    from dadip.api import deps
    from dadip.core.config import get_settings

    monkeypatch.setattr(get_settings(), "public_report_rate_per_minute", 2)
    monkeypatch.setattr(deps, "_limiter", deps.RateLimiter(None))  # memory backend, isolated from Redis
    codes = [client.post("/api/v1/reports", json=REPORT).status_code for _ in range(3)]
    assert codes == [201, 201, 429]


def test_client_ip_trusts_forwarded_for_only_from_trusted_proxy(monkeypatch):
    from starlette.requests import Request

    from dadip.api.deps import client_ip
    from dadip.core.config import get_settings

    def req(peer, xff=None):
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "client": (peer, 1234), "headers": headers})

    monkeypatch.setattr(get_settings(), "trusted_proxies", ["10.0.0.5"])
    assert client_ip(req("10.0.0.5", "spoofed, 203.0.113.7")) == "203.0.113.7"
    assert client_ip(req("198.51.100.9", "203.0.113.7")) == "198.51.100.9"   # untrusted peer: header ignored
    assert client_ip(req("10.0.0.5")) == "10.0.0.5"


def test_client_ip_trusts_forwarded_for_with_proxy_secret(monkeypatch):
    from starlette.requests import Request

    from dadip.api.deps import client_ip
    from dadip.core.config import get_settings

    monkeypatch.setattr(get_settings(), "proxy_shared_secret", "s3cret-value")

    def req(secret):
        return Request({"type": "http", "client": ("52.1.2.3", 1), "headers": [
            (b"x-forwarded-for", b"203.0.113.7"), (b"x-dadip-proxy-auth", secret.encode())]})

    assert client_ip(req("s3cret-value")) == "203.0.113.7"
    assert client_ip(req("wrong")) == "52.1.2.3"

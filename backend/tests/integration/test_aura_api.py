import httpx
import pytest

from dadip.api.routers.incidents import get_weather_fetcher
from dadip.aura import weather
from dadip.aura.pipeline import WeatherObservation
from tests.integration.test_api_foundation import INCIDENT, REPORT

pytestmark = pytest.mark.integration

OBS = WeatherObservation(rainfall=18.0, humidity=91, temperature=26, wind_speed=40, pressure=1001,
                         observed_at="2026-11-01T12:00")


@pytest.fixture
def fixed_weather(client):
    client.app.dependency_overrides[get_weather_fetcher] = lambda: (lambda lat, lon: OBS)
    yield
    client.app.dependency_overrides.clear()


def test_assess_stores_reproducible_assessment(client, auth_header, fixed_weather):
    h = auth_header("operator")
    inc = client.post("/api/v1/incidents", json=INCIDENT, headers=h).json()
    a1 = client.post(f"/api/v1/incidents/{inc['id']}/assess", headers=h)
    assert a1.status_code == 201, a1.text
    a2 = client.post(f"/api/v1/incidents/{inc['id']}/assess", headers=h).json()
    a1 = a1.json()
    for key in ("risk", "reliability", "admissibility", "uncertainty", "inputs"):
        assert a1[key] == a2[key]
    assert a1["input_provenance"]["rainfall"] == "observed"
    assert a1["input_provenance"]["_weather"]["observed_at"] == "2026-11-01T12:00"
    listed = client.get(f"/api/v1/incidents/{inc['id']}/assessments", headers=h).json()
    assert len(listed) == 2


def test_assess_without_weather_marks_defaults(client, auth_header, fixed_weather):
    h = auth_header("operator")
    inc = client.post("/api/v1/incidents", json=INCIDENT, headers=h).json()
    a = client.post(f"/api/v1/incidents/{inc['id']}/assess?live_weather=false", headers=h).json()
    assert a["input_provenance"]["rainfall"] == "default"
    assert "rainfall" in a["reliability"]["inputs_defaulted"]


def test_assess_requires_operator(client, auth_header, fixed_weather):
    inc = client.post("/api/v1/incidents", json=INCIDENT, headers=auth_header("operator")).json()
    assert client.post(f"/api/v1/incidents/{inc['id']}/assess", headers=auth_header("citizen")).status_code == 403


def test_open_meteo_failure_returns_none():
    def boom(request):
        raise httpx.ConnectError("offline")

    client = httpx.Client(transport=httpx.MockTransport(boom))
    assert weather.fetch_current(10, 76, client=client) is None


def test_open_meteo_parsing():
    payload = {"current": {"time": "2026-11-01T12:00", "temperature_2m": 29.1, "relative_humidity_2m": 80,
                           "precipitation": 2.5, "wind_speed_10m": 14.0, "surface_pressure": 1008.2}}
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload)))
    obs = weather.fetch_current(10, 76, client=client)
    assert obs.rainfall == 2.5 and obs.pressure == 1008.2 and obs.observed_at == "2026-11-01T12:00"


def test_report_gets_credibility_and_corroboration_raises_it(client, auth_header):
    first = client.post("/api/v1/reports", json=REPORT).json()
    for _ in range(3):
        client.post("/api/v1/reports", json=dict(REPORT, latitude=26.11))
    items = client.get("/api/v1/reports", headers=auth_header("operator")).json()["items"]
    by_id = {r["id"]: r for r in items}
    newest = items[0]
    assert by_id[first["id"]]["credibility"] is not None
    assert newest["credibility"] > by_id[first["id"]]["credibility"]
    assert newest["credibility_detail"]["corroborating_reports"] == 3

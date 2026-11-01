"""Live weather from Open-Meteo (free, no key). Ported from the original NDEM/Open-Meteo integration, but
queried at the incident's own coordinates instead of a fixed point in Mumbai."""

import logging

import httpx

from dadip.aura.pipeline import WeatherObservation

log = logging.getLogger(__name__)
URL = "https://api.open-meteo.com/v1/forecast"


def fetch_current(lat: float, lon: float, client: httpx.Client | None = None, timeout: float = 5.0
                  ) -> WeatherObservation | None:
    params = {"latitude": lat, "longitude": lon,
              "current": "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,surface_pressure"}
    try:
        c = client or httpx.Client(timeout=timeout)
        r = c.get(URL, params=params)
        r.raise_for_status()
        cur = r.json()["current"]
        return WeatherObservation(rainfall=float(cur["precipitation"]), humidity=float(cur["relative_humidity_2m"]),
                                  temperature=float(cur["temperature_2m"]), wind_speed=float(cur["wind_speed_10m"]),
                                  pressure=float(cur["surface_pressure"]), observed_at=cur.get("time"))
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        log.warning("open-meteo unavailable", extra={"error": type(e).__name__, "lat": lat, "lon": lon})
        return None

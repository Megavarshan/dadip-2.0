"""Report credibility, version 0: corroboration heuristic.

A citizen report is more credible when independent evidence agrees with it. v0 combines three signals, each
in [0, 1], with fixed weights. It is a transparent rule, not a trained classifier, and is labelled as such.

- corroboration: other reports of the same hazard within RADIUS_KM and WINDOW_H (saturates at 3 reports)
- incident_match: an open incident of the same hazard within RADIUS_KM (1.0 at the location, 0 at the radius)
- detail: description length and the presence of concrete observations (numbers, place words), capped at 1

Evaluation: without labelled ground truth this score is only checked for monotonic behaviour in tests; a
labelled evaluation is listed as future work in docs/research/aura.md.
"""

import math
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

VERSION = "credibility-heuristic-0"
RADIUS_KM = 25.0
WINDOW_H = 6
WEIGHTS = {"corroboration": 0.45, "incident_match": 0.35, "detail": 0.20}


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@dataclass(frozen=True)
class Point:
    hazard_type: str
    latitude: float
    longitude: float
    at: datetime | None = None


def detail_score(text: str) -> float:
    words = len(text.split())
    has_number = bool(re.search(r"\d", text))
    length = min(1.0, words / 25)
    return round(min(1.0, 0.7 * length + 0.3 * has_number), 3)


def score(report: Point, description: str, other_reports: list[Point], open_incidents: list[Point]) -> dict:
    window_start = report.at - timedelta(hours=WINDOW_H) if report.at else None
    corroborating = [
        p for p in other_reports
        if p.hazard_type == report.hazard_type
        and haversine_km(report.latitude, report.longitude, p.latitude, p.longitude) <= RADIUS_KM
        and (window_start is None or p.at is None or p.at >= window_start)
    ]
    corroboration = min(1.0, len(corroborating) / 3)

    distances = [haversine_km(report.latitude, report.longitude, i.latitude, i.longitude)
                 for i in open_incidents if i.hazard_type == report.hazard_type]
    nearest = min(distances) if distances else None
    incident_match = max(0.0, 1 - nearest / RADIUS_KM) if nearest is not None else 0.0

    detail = detail_score(description)
    total = (WEIGHTS["corroboration"] * corroboration + WEIGHTS["incident_match"] * incident_match
             + WEIGHTS["detail"] * detail)
    return {
        "version": VERSION,
        "score": round(total, 3),
        "signals": {"corroboration": round(corroboration, 3), "incident_match": round(incident_match, 3),
                    "detail": detail},
        "corroborating_reports": len(corroborating),
        "nearest_incident_km": round(nearest, 2) if nearest is not None else None,
        "weights": WEIGHTS,
    }

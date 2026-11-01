"""Glue between AURA and the database."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from dadip.aura import credibility, pipeline
from dadip.aura.pipeline import WeatherObservation
from dadip.core.config import get_settings
from dadip.db.models import AuraAssessment, Incident, IncidentReport

WeatherFetcher = Callable[[float, float], WeatherObservation | None]


def assess_incident(db: Session, incident: Incident, actor_id: uuid.UUID | None,
                    weather_fetcher: WeatherFetcher | None) -> AuraAssessment:
    weather = weather_fetcher(incident.latitude, incident.longitude) if weather_fetcher else None
    built = pipeline.build_input(incident.hazard_type, incident.latitude, incident.longitude, weather)
    result = pipeline.assess(built, get_settings().admissibility_threshold)
    if weather:
        result["input_provenance"]["_weather"] = {"source": weather.source, "observed_at": weather.observed_at}
    row = AuraAssessment(
        incident_id=incident.id, model_version=result["model_version"], inputs=result["inputs"],
        input_provenance=result["input_provenance"], risk=result["risk"], reliability=result["reliability"],
        distribution_shift=result["distribution_shift"], admissibility=result["admissibility"],
        explanation=result["explanation"], uncertainty=result["uncertainty"],
        composite_risk=result["risk"]["compositeRisk"],
        admissibility_score=result["admissibility"]["admissibilityScore"],
        decision=result["admissibility"]["decision"], created_by=actor_id,
    )
    db.add(row)
    db.flush()
    return row


def score_report(db: Session, report: IncidentReport) -> None:
    now = report.created_at or datetime.now(UTC)
    # Coarse bounding box (~0.3 deg) narrows the query; the haversine test inside `score` is exact.
    box = 0.3
    near = select(IncidentReport).where(
        IncidentReport.id != report.id,
        IncidentReport.hazard_type == report.hazard_type,
        IncidentReport.status != "dismissed",
        IncidentReport.latitude.between(report.latitude - box, report.latitude + box),
        IncidentReport.longitude.between(report.longitude - box, report.longitude + box),
        IncidentReport.created_at >= now - timedelta(hours=credibility.WINDOW_H),
    )
    incidents = select(Incident).where(
        Incident.status != "closed", Incident.hazard_type == report.hazard_type,
        Incident.latitude.between(report.latitude - box, report.latitude + box),
        Incident.longitude.between(report.longitude - box, report.longitude + box),
    )
    others = [credibility.Point(r.hazard_type, r.latitude, r.longitude, r.created_at) for r in db.scalars(near)]
    incs = [credibility.Point(i.hazard_type, i.latitude, i.longitude) for i in db.scalars(incidents)]
    result = credibility.score(credibility.Point(report.hazard_type, report.latitude, report.longitude, now),
                               report.description, others, incs)
    report.credibility = result["score"]
    report.credibility_detail = result

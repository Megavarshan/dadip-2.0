from datetime import UTC, datetime, timedelta

from dadip.aura import credibility, pipeline
from dadip.aura.engines import CHI2_12_P95

OBS = pipeline.WeatherObservation(rainfall=12.0, humidity=88, temperature=27, wind_speed=35, pressure=1002)


def test_assessment_is_deterministic():
    a = pipeline.assess(pipeline.build_input("flood", 26.1, 91.7, OBS))
    b = pipeline.assess(pipeline.build_input("flood", 26.1, 91.7, OBS))
    assert a == b


def test_provenance_marks_observed_vs_default():
    with_obs = pipeline.build_input("flood", 26.1, 91.7, OBS).provenance
    without = pipeline.build_input("flood", 26.1, 91.7, None).provenance
    assert with_obs["rainfall"] == "observed" and without["rainfall"] == "default"
    assert with_obs["historicalDensity"] == "estimated"
    result = pipeline.assess(pipeline.build_input("flood", 26.1, 91.7, None))
    assert "rainfall" in result["reliability"]["inputs_defaulted"]


def test_hazard_priors_match_original_pipeline():
    eq = pipeline.build_input("earthquake", 30.7, 78.4, OBS).x
    fl = pipeline.build_input("flood", 30.7, 78.4, OBS).x
    cy = pipeline.build_input("cyclone", 30.7, 78.4, OBS).x
    assert (eq.seismicActivity, fl.seismicActivity) == (0.7, 0.2)
    assert (fl.historicalDensity, eq.historicalDensity) == (0.6, 0.3)
    assert (cy.coastalProximity, fl.coastalProximity) == (0.8, 0.3)


def test_uncertainty_bounds_contain_point_estimate():
    r = pipeline.assess(pipeline.build_input("cyclone", 16.5, 86.0, OBS))
    u = r["uncertainty"]
    assert u["composite_risk_p05"] <= r["risk"]["compositeRisk"] <= u["composite_risk_p95"]
    assert 0 <= u["decision_stability"] <= 1 and u["n"] == pipeline.N_PERTURBATIONS


def test_corrected_ood_uses_squared_distance():
    typical = pipeline.build_input("flood", 20, 79, pipeline.WeatherObservation(45, 65, 28, 30, 1010)).x
    assert pipeline.corrected_ood(typical)["is_out_of_distribution"] is False
    extreme = pipeline.build_input("cyclone", 20, 79, pipeline.WeatherObservation(300, 100, 45, 240, 905)).x
    c = pipeline.corrected_ood(extreme)
    assert c["is_out_of_distribution"] is True and c["squared_distance"] > CHI2_12_P95


def test_level_thresholds():
    assert [pipeline.level_for(v) for v in (0, 34, 35, 59, 60, 79, 80, 100)] == [
        "green", "green", "yellow", "yellow", "orange", "orange", "red", "red"]


def test_approval_policy():
    assert pipeline.requires_approval("green", "execute", "orange")[0] is False
    assert pipeline.requires_approval("orange", "execute", "orange")[0] is True
    assert pipeline.requires_approval("green", "defer", "orange")[0] is True
    assert pipeline.requires_approval("green", "abstain", "red")[0] is True


# ---- credibility ----
NOW = datetime(2026, 11, 1, 12, tzinfo=UTC)
REPORT = credibility.Point("flood", 26.10, 91.70, NOW)


def test_credibility_increases_with_corroboration():
    alone = credibility.score(REPORT, "water rising", [], [])["score"]
    near = [credibility.Point("flood", 26.12, 91.71, NOW - timedelta(hours=1)) for _ in range(3)]
    corroborated = credibility.score(REPORT, "water rising", near, [])["score"]
    assert corroborated > alone


def test_credibility_ignores_far_old_or_other_hazard_reports():
    noise = [credibility.Point("flood", 28.0, 91.7, NOW),                      # ~210 km away
             credibility.Point("flood", 26.1, 91.7, NOW - timedelta(hours=12)),  # outside window
             credibility.Point("fire", 26.1, 91.7, NOW)]                         # different hazard
    assert credibility.score(REPORT, "x", noise, [])["signals"]["corroboration"] == 0


def test_credibility_incident_match_decays_with_distance():
    at = credibility.score(REPORT, "x", [], [credibility.Point("flood", 26.10, 91.70)])["signals"]["incident_match"]
    far = credibility.score(REPORT, "x", [], [credibility.Point("flood", 26.25, 91.70)])["signals"]["incident_match"]
    assert at == 1.0 and 0 < far < at


def test_haversine_known_distance():
    # Chennai -> Bengaluru, about 290 km great-circle
    assert 280 < credibility.haversine_km(13.0827, 80.2707, 12.9716, 77.5946) < 300

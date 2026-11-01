"""AURA 2.0 assessment pipeline.

Wraps the parity-tested engines (`dadip.aura.engines`) with what DADIP 2.0 adds:

1. Deterministic inputs with provenance. The original filled missing weather with Math.random(); here every
   feature is labelled `observed` (measured), `estimated` (geo heuristic / hazard prior) or `default` (fixed
   constant), and nothing is random. Same incident + same observation -> same assessment.
2. Sensitivity-based uncertainty. Inputs are perturbed with documented measurement noise; we report the 5-95%
   range of composite risk and how often the decision stays the same. The perturbation seed is derived from
   the inputs, so this too is reproducible. It measures sensitivity of the heuristic to input error, not the
   model's predictive calibration (which would need labelled outcomes we do not have).
3. A corrected out-of-distribution test (squared distance vs chi-square(12) 95th percentile) reported next to
   the original flag.
4. A decision policy mapping risk + admissibility to an alert level and an approval requirement.
"""

import hashlib
import json
import random
from dataclasses import dataclass, field

from dadip.aura import engines as E

PIPELINE_VERSION = f"{E.ENGINE_VERSION}+pipeline-2.0"

LEVELS = ("green", "yellow", "orange", "red")

# 1-sigma measurement noise used for the sensitivity analysis (documented in docs/research/aura.md).
NOISE = {"rainfall": 0.20, "humidity": 5.0, "temperature": 1.0, "windSpeed": 0.15, "pressure": 2.0,
         "elevation": 0.0, "slope": 3.0, "historicalDensity": 0.05, "seismicActivity": 0.05,
         "coastalProximity": 0.05, "riverProximity": 0.05, "weatherSeverity": 0.05}
RELATIVE_NOISE = {"rainfall", "windSpeed"}  # value is a fraction of the reading
UNIT_INTERVAL = {"historicalDensity", "seismicActivity", "coastalProximity", "riverProximity", "weatherSeverity"}
N_PERTURBATIONS = 200


@dataclass(frozen=True)
class WeatherObservation:
    rainfall: float      # mm in the last hour (Open-Meteo `precipitation`)
    humidity: float
    temperature: float
    wind_speed: float    # km/h
    pressure: float      # hPa
    source: str = "open-meteo"
    observed_at: str | None = None


# Hazard priors from the original pipeline (`runPipeline`), recorded as `estimated` inputs.
HAZARD_PRIORS = {
    "historicalDensity": {"flood": 0.6, "_": 0.3},
    "seismicActivity": {"earthquake": 0.7, "_": 0.2},
    "coastalProximity": {"cyclone": 0.8, "tsunami": 0.8, "_": 0.3},
}

# Used only when no observation is available; reliability then reflects the missing data via provenance.
DEFAULT_WEATHER = {"rainfall": 0.0, "humidity": 65.0, "temperature": 28.0, "windSpeed": 10.0, "pressure": 1013.0}


@dataclass
class BuiltInput:
    x: E.PredictionInput
    provenance: dict[str, str] = field(default_factory=dict)


def build_input(hazard_type: str, latitude: float, longitude: float,
                weather: WeatherObservation | None = None, elevation: float | None = None,
                slope: float | None = None) -> BuiltInput:
    prov: dict[str, str] = {}
    if weather:
        w = {"rainfall": weather.rainfall, "humidity": weather.humidity, "temperature": weather.temperature,
             "windSpeed": weather.wind_speed, "pressure": weather.pressure}
        prov.update(dict.fromkeys(w, "observed"))
    else:
        w = dict(DEFAULT_WEATHER)
        prov.update(dict.fromkeys(w, "default"))

    def prior(name: str) -> float:
        table = HAZARD_PRIORS[name]
        prov[name] = "estimated"
        return table.get(hazard_type, table["_"])

    if elevation is None:
        elevation = 200 + abs(latitude) * 5  # original formula
        prov["elevation"] = "estimated"
    else:
        prov["elevation"] = "observed"
    if slope is None:
        slope = 15.0  # the original drew 5-20 at random; the midpoint is used so results are reproducible
        prov["slope"] = "default"
    else:
        prov["slope"] = "observed"
    prov["riverProximity"] = "default"
    prov["weatherSeverity"] = "estimated"

    x = E.PredictionInput(
        rainfall=w["rainfall"], humidity=w["humidity"], temperature=w["temperature"], windSpeed=w["windSpeed"],
        pressure=w["pressure"], elevation=elevation, slope=slope, latitude=latitude, longitude=longitude,
        historicalDensity=prior("historicalDensity"), seismicActivity=prior("seismicActivity"),
        coastalProximity=prior("coastalProximity"), riverProximity=0.4,
        weatherSeverity=min(1.0, w["rainfall"] / 100 * 0.4 + w["windSpeed"] / 120 * 0.35),
    )
    return BuiltInput(x=x, provenance=prov)


def level_for(composite_risk: int) -> str:
    """Same thresholds as the original alert generator."""
    if composite_risk >= 80:
        return "red"
    if composite_risk >= 60:
        return "orange"
    if composite_risk >= 35:
        return "yellow"
    return "green"


def _seed_for(x: E.PredictionInput) -> int:
    digest = hashlib.sha256(json.dumps(x.as_dict(), sort_keys=True).encode()).hexdigest()
    return int(digest[:16], 16)


def _decide(x: E.PredictionInput, threshold: float) -> tuple[int, str]:
    risk = E.predict_risk(x)
    rel = E.estimate_reliability(x, risk)
    shift = E.detect_shift(x)
    return risk["compositeRisk"], E.compute_admissibility(rel["reliabilityScore"], shift["normalizedDistance"],
                                                           threshold)["decision"]


def sensitivity(x: E.PredictionInput, threshold: float, n: int = N_PERTURBATIONS) -> dict:
    rng = random.Random(_seed_for(x))
    base_risk, base_decision = _decide(x, threshold)
    risks, same, levels_same = [], 0, 0
    base = x.as_dict()
    for _ in range(n):
        p = dict(base)
        for f, sd in NOISE.items():
            if sd == 0:
                continue
            noise = rng.gauss(0, sd * base[f] if f in RELATIVE_NOISE else sd)
            v = base[f] + noise
            if f in UNIT_INTERVAL:
                v = min(1.0, max(0.0, v))
            elif f in ("rainfall", "windSpeed", "slope"):
                v = max(0.0, v)
            p[f] = v
        r, d = _decide(E.PredictionInput(**p), threshold)
        risks.append(r)
        same += d == base_decision
        levels_same += level_for(r) == level_for(base_risk)
    risks.sort()
    q = lambda frac: risks[min(n - 1, int(frac * n))]  # noqa: E731
    return {"method": "input-perturbation", "n": n, "composite_risk_p05": q(0.05), "composite_risk_p50": q(0.5),
            "composite_risk_p95": q(0.95), "decision_stability": round(same / n, 3),
            "level_stability": round(levels_same / n, 3), "noise_model": NOISE}


def corrected_ood(x: E.PredictionInput) -> dict:
    feats = x.as_dict()
    d2 = sum((feats[f] - mu) ** 2 / (sd * sd) for f, mu, sd in zip(E.SHIFT_FEATURES, E.TRAIN_MEAN, E.TRAIN_STD,
                                                                     strict=True))
    return {"squared_distance": round(d2, 3), "threshold": E.CHI2_12_P95, "is_out_of_distribution": d2 > E.CHI2_12_P95,
            "test": "chi-square(12) p=0.95 on squared diagonal Mahalanobis distance"}


def assess(built: BuiltInput, threshold: float = 0.55) -> dict:
    x = built.x
    risk = E.predict_risk(x)
    rel = E.estimate_reliability(x, risk)
    shift = E.detect_shift(x)
    shift["corrected"] = corrected_ood(x)
    adm = E.compute_admissibility(rel["reliabilityScore"], shift["normalizedDistance"], threshold)
    missing = sorted(k for k, v in built.provenance.items() if v == "default")
    rel["inputs_defaulted"] = missing
    return {
        "model_version": PIPELINE_VERSION,
        "inputs": x.as_dict(),
        "input_provenance": built.provenance,
        "risk": risk,
        "reliability": rel,
        "distribution_shift": shift,
        "admissibility": adm,
        "explanation": E.explain_prediction(x),
        "uncertainty": sensitivity(x, threshold),
        "alert_level": level_for(risk["compositeRisk"]),
    }


def requires_approval(level: str, decision: str, approval_from_level: str) -> tuple[bool, str]:
    """An alert is sent without an approver only if AURA says `execute` AND its level is below the
    configured approval level. Everything else waits for a human. (With the original engine constants,
    `execute` is unreachable from pipeline inputs — see docs/research/aura.md — so in practice every
    alert is approved by a person.)"""
    if decision != "execute":
        return True, f"AURA decision is '{decision}'"
    if LEVELS.index(level) >= LEVELS.index(approval_from_level):
        return True, f"level '{level}' requires approval (policy: from '{approval_from_level}')"
    return False, "AURA execute and below approval level"

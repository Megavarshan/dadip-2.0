"""AURA engines, ported from the original DADIP `src/lib/engines/index.ts` (commit 7342155).

The port is behaviour-identical, including JavaScript rounding (`Math.round` rounds .5 up, Python's `round`
rounds to even). `tests/unit/test_aura_parity.py` runs the original TypeScript on the same inputs and checks
every output field.

What these engines are: hand-weighted heuristics, not trained models. Weights, bounds, "training" means and
variances were chosen by the original author; nothing here was fitted to data. They are kept because the
decision-admissibility structure, A(x) = r(x) * (1 - D_M(x)), is the research core of DADIP, and DADIP 2.0
evaluates it rather than replacing it with an opaque model.
"""

import math
from dataclasses import asdict, dataclass

ENGINE_VERSION = "aura-heuristic-1.0"

FEATURES = (
    "rainfall", "humidity", "temperature", "windSpeed", "pressure", "elevation", "slope",
    "seismicActivity", "coastalProximity", "riverProximity", "historicalDensity", "weatherSeverity",
)


def js_round(x: float) -> int:
    """JavaScript Math.round: halves round towards +infinity.

    Not `floor(x + 0.5)`: that addition can itself round up (0.49999999999999994 + 0.5 == 1.0 in binary
    floating point), while Math.round compares the fractional part exactly."""
    lower = math.floor(x)
    return lower + 1 if x - lower >= 0.5 else lower


def r2(x: float) -> float:
    return js_round(x * 100) / 100


def r3(x: float) -> float:
    return js_round(x * 1000) / 1000


@dataclass(frozen=True)
class PredictionInput:
    rainfall: float          # mm
    humidity: float          # %
    temperature: float       # deg C
    windSpeed: float         # km/h
    pressure: float          # hPa
    elevation: float         # m
    slope: float             # degrees
    latitude: float
    longitude: float
    historicalDensity: float  # 0..1
    seismicActivity: float    # 0..1
    coastalProximity: float   # 0..1
    riverProximity: float     # 0..1
    weatherSeverity: float    # 0..1

    def as_dict(self) -> dict[str, float]:
        return asdict(self)


# ---------------- Module 3: risk prediction ----------------
CYCLONE_W = {"rainfall": 0.15, "humidity": 0.10, "temperature": 0.05, "windSpeed": 0.30, "pressure": -0.20,
             "coastalProximity": 0.10, "historicalDensity": 0.05, "weatherSeverity": 0.05}
TSUNAMI_W = {"seismicActivity": 0.40, "coastalProximity": 0.25, "elevation": -0.15, "historicalDensity": 0.10,
             "pressure": 0.05, "weatherSeverity": 0.05}
FLOOD_W = {"rainfall": 0.30, "humidity": 0.10, "riverProximity": 0.15, "elevation": -0.15, "slope": -0.05,
           "historicalDensity": 0.15, "weatherSeverity": 0.10}
EARTHQUAKE_W = {"seismicActivity": 0.45, "historicalDensity": 0.20, "elevation": 0.05, "slope": 0.10,
                "pressure": 0.05, "weatherSeverity": 0.05, "coastalProximity": 0.10}

BOUNDS = {
    "rainfall": (0, 300), "humidity": (0, 100), "temperature": (-10, 50), "windSpeed": (0, 250),
    "pressure": (900, 1050), "elevation": (0, 5000), "slope": (0, 90), "seismicActivity": (0, 1),
    "coastalProximity": (0, 1), "riverProximity": (0, 1), "historicalDensity": (0, 1), "weatherSeverity": (0, 1),
}


def _norm(v: float, lo: float, hi: float) -> float:
    return max(0.0, min(1.0, (v - lo) / (hi - lo)))


def _hazard_score(feats: dict[str, float], weights: dict[str, float]) -> int:
    score = 0.0
    for f, w in weights.items():
        lo, hi = BOUNDS[f]
        n = _norm(feats.get(f, 0), lo, hi)
        score += abs(w) * (1 - n) if w < 0 else w * n
    return js_round((1 / (1 + math.exp(-6 * (score - 0.5)))) * 100)


def severity_from_score(s: float) -> str:
    if s >= 80:
        return "critical"
    if s >= 60:
        return "high"
    if s >= 35:
        return "moderate"
    return "low"


def predict_risk(x: PredictionInput) -> dict:
    feats = x.as_dict()
    c = _hazard_score(feats, CYCLONE_W)
    t = _hazard_score(feats, TSUNAMI_W)
    f = _hazard_score(feats, FLOOD_W)
    e = _hazard_score(feats, EARTHQUAKE_W)
    m = max(c, t, f, e)
    composite = js_round(0.6 * m + 0.4 * ((c + t + f + e) / 4))
    dominant = "cyclone" if m == c else "tsunami" if m == t else "flood" if m == f else "earthquake"
    return {"cycloneRisk": c, "tsunamiRisk": t, "floodRisk": f, "earthquakeRisk": e, "compositeRisk": composite,
            "severity": severity_from_score(composite), "dominantHazard": dominant}


# ---------------- Module 4: reliability r(x) ----------------
NORMAL_RANGES = {
    "rainfall": (5, 80), "humidity": (40, 85), "temperature": (15, 40), "windSpeed": (5, 60),
    "pressure": (990, 1020), "elevation": (50, 1500), "seismicActivity": (0, 0.5),
    "coastalProximity": (0, 0.8), "historicalDensity": (0.1, 0.6), "weatherSeverity": (0.1, 0.5),
}


def estimate_reliability(x: PredictionInput, risk: dict) -> dict:
    risks = [risk["cycloneRisk"] / 100, risk["tsunamiRisk"] / 100, risk["floodRisk"] / 100,
             risk["earthquakeRisk"] / 100]
    safe = max(0.01, 1 - max(risks))
    allp = [*risks, safe]
    tot = sum(allp)
    entropy = -sum((p / tot) * math.log2(p / tot) for p in allp if p / tot > 0) / math.log2(5)

    feats = x.as_dict()
    in_range = sum(1 for f, (lo, hi) in NORMAL_RANGES.items() if lo <= feats[f] <= hi)
    coverage = in_range / len(NORMAL_RANGES)

    s = sorted(risks, reverse=True)
    calibration = 0.5 * (s[0] - s[1]) + 0.5 * abs(s[0] - 0.5) * 2

    rel = max(0.05, min(0.99, 0.4 * (1 - entropy) + 0.35 * coverage + 0.25 * calibration))
    if rel >= 0.9:
        interp = "Very high confidence — prediction is highly trustworthy"
    elif rel >= 0.75:
        interp = "Good confidence — prediction can be acted upon"
    elif rel >= 0.6:
        interp = "Moderate confidence — use with caution"
    elif rel >= 0.4:
        interp = "Low confidence — prediction may be unreliable"
    else:
        interp = "Very low confidence — prediction should not be trusted"
    return {"reliabilityScore": r2(rel), "predictionEntropy": r3(entropy), "featureCoverage": r2(coverage),
            "calibrationScore": r3(calibration), "interpretation": interp}


# ---------------- Module 5: distribution shift (diagonal Mahalanobis) ----------------
SHIFT_FEATURES = ("rainfall", "humidity", "temperature", "windSpeed", "pressure", "elevation", "slope",
                  "seismicActivity", "coastalProximity", "riverProximity", "historicalDensity", "weatherSeverity")
TRAIN_MEAN = (45, 65, 28, 30, 1010, 300, 15, 0.3, 0.25, 0.4, 0.35, 0.35)
TRAIN_STD = (35, 18, 8, 25, 15, 400, 10, 0.2, 0.25, 0.3, 0.2, 0.2)
MAX_DIST = 30
# Original constant, kept for parity. 16.92 is the chi-square 95th percentile for 9 degrees of freedom on the
# SQUARED distance, but the original compares it with the unsquared distance over 12 features, so the flag only
# fires when the squared distance exceeds ~286. `dadip.aura.pipeline` adds a corrected test alongside it.
OOD_THRESHOLD = 16.92
CHI2_12_P95 = 21.026  # scipy.stats.chi2.ppf(0.95, 12)


def detect_shift(x: PredictionInput) -> dict:
    feats = x.as_dict()
    d = sum((feats[f] - mu) ** 2 * (1 / (sd * sd)) for f, mu, sd in zip(SHIFT_FEATURES, TRAIN_MEAN, TRAIN_STD,
                                                                          strict=True))
    mah = math.sqrt(d)
    nd = min(1.0, mah / MAX_DIST)
    ood = "low" if nd < 0.3 else "moderate" if nd < 0.6 else "high"
    return {"mahalanobisDistance": r2(mah), "normalizedDistance": r3(nd),
            "distributionSimilarity": js_round((1 - nd) * 100), "oodScore": r3(nd), "oodRisk": ood,
            "isOutOfDistribution": mah > OOD_THRESHOLD}


# ---------------- Module 6: decision admissibility ----------------
def compute_admissibility(reliability: float, normalized_mah: float, threshold: float = 0.55) -> dict:
    score = js_round(reliability * (1 - normalized_mah) * 100) / 100
    if score >= threshold:
        decision = "execute"
    elif score >= threshold * 0.7:
        decision = "defer"
    else:
        decision = "abstain"
    confidence = ("Very High" if score >= 0.85 else "High" if score >= 0.7 else "Moderate" if score >= 0.55
                  else "Low" if score >= 0.35 else "Very Low")
    parts = [
        "Model prediction has very high reliability" if reliability >= 0.85
        else "Model prediction has acceptable reliability" if reliability >= 0.65
        else "Model prediction has low reliability",
        "Input data matches training distribution" if normalized_mah < 0.2
        else "Moderate deviation from training distribution" if normalized_mah < 0.5
        else "Significant distribution shift detected",
    ]
    if decision == "execute":
        parts.append(f"Admissibility ({score:.2f}) ≥ threshold ({_js_num(threshold)}) — EXECUTE")
    elif decision == "defer":
        parts.append(f"Admissibility ({score:.2f}) below threshold — DEFER to human review")
    else:
        parts.append(f"Admissibility ({score:.2f}) too low — ABSTAIN")
    return {"admissibilityScore": score, "decision": decision, "threshold": threshold, "reliability": reliability,
            "normalizedMahalanobis": normalized_mah, "confidence": confidence, "reasoning": ". ".join(parts) + "."}


def _js_num(v: float) -> str:
    """Format a number the way JavaScript template strings do (0.55, not 0.550000)."""
    return str(int(v)) if float(v).is_integer() else repr(float(v))


# ---------------- Module 7: feature deviation ("explainability") ----------------
FEAT_LABELS = {"rainfall": "Rainfall", "humidity": "Humidity", "temperature": "Temperature", "windSpeed": "Wind Speed",
               "pressure": "Atmospheric Pressure", "elevation": "Elevation", "slope": "Terrain Slope",
               "seismicActivity": "Seismic Activity", "coastalProximity": "Coastal Proximity",
               "riverProximity": "River Proximity", "historicalDensity": "Historical Disasters",
               "weatherSeverity": "Weather Severity"}
BASELINES = {"rainfall": 45, "humidity": 65, "temperature": 28, "windSpeed": 30, "pressure": 1010, "elevation": 300,
             "slope": 15, "seismicActivity": 0.3, "coastalProximity": 0.4, "riverProximity": 0.35,
             "historicalDensity": 0.35, "weatherSeverity": 0.35}
IMPORTANCE = {"rainfall": 0.15, "humidity": 0.08, "temperature": 0.06, "windSpeed": 0.14, "pressure": 0.08,
              "elevation": 0.06, "slope": 0.05, "seismicActivity": 0.14, "coastalProximity": 0.08,
              "riverProximity": 0.06, "historicalDensity": 0.06, "weatherSeverity": 0.04}


def explain_prediction(x: PredictionInput) -> dict:
    """Weighted deviation from fixed baselines. This is descriptive, not a SHAP-style attribution of the
    risk model: it says which inputs are most unusual, weighted by hand-set importance."""
    feats = x.as_dict()
    raw = []
    for f, base in BASELINES.items():
        val = feats.get(f, base)
        dev = val - base
        nd = abs(dev / base) if base != 0 else abs(dev)
        c = min(IMPORTANCE.get(f, 0.05) * nd * 100, 50)
        raw.append({"feature": FEAT_LABELS.get(f, f), "contribution": js_round(c * 10) / 10,
                    "direction": "positive" if dev >= 0 else "negative", "value": val})
    raw.sort(key=lambda r: -r["contribution"])
    total = sum(r["contribution"] for r in raw)
    if total > 0:
        for r in raw:
            r["contribution"] = js_round((r["contribution"] / total) * 100)
    top = raw[0]["feature"] if raw else "Unknown"
    return {"contributions": raw, "topFactor": top,
            "summary": "Primary drivers: " + ", ".join(r["feature"] for r in raw[:3]), "method": "feature-deviation"}


# ---------------- original input builder (geo heuristics for India) ----------------
def estimate_coastal(lat: float, lng: float) -> float:
    if lng < 68 or lng > 97 or lat < 6 or lat > 37:
        return 0.1
    if lat < 10 and 76 < lng < 80:
        return 0.9
    if 18 < lat < 22 and 85 < lng < 90:
        return 0.85
    if lng < 73 and 15 < lat < 22:
        return 0.8
    return 0.3


def estimate_seismic(lat: float, lng: float) -> float:
    if lat > 28 and 77 < lng < 97:
        return 0.8
    if 25 < lat < 35 and 74 < lng < 80:
        return 0.6
    if 8 < lat < 13 and 92 < lng < 94:
        return 0.75
    return 0.2

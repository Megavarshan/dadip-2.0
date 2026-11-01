"""The Python AURA port must reproduce the original TypeScript engines exactly.

Fixture: tests/fixtures/aura_parity.json, produced by tests/parity/generate_fixture.py, which executes the
original `src/lib/engines/index.ts` from disaster-ai@7342155 under Node.
"""

import json
from pathlib import Path

import pytest

from dadip.aura.engines import (
    PredictionInput,
    compute_admissibility,
    detect_shift,
    estimate_reliability,
    explain_prediction,
    js_round,
    predict_risk,
)

DATA = json.loads((Path(__file__).parent.parent / "fixtures" / "aura_parity.json").read_text())
CASES = DATA["cases"]


def _close(a, b):
    if isinstance(a, float) or isinstance(b, float):
        return abs(a - b) < 1e-9
    return a == b


def _assert_same(actual: dict, expected: dict, where: str):
    for key, exp in expected.items():
        assert key in actual, f"{where}: missing {key}"
        assert _close(actual[key], exp), f"{where}.{key}: python={actual[key]!r} original={exp!r}"


@pytest.mark.parametrize("case", CASES, ids=[f"case{i}" for i in range(len(CASES))])
def test_pipeline_matches_original(case):
    x = PredictionInput(**case["input"])
    exp = case["expected"]

    risk = predict_risk(x)
    _assert_same(risk, exp["risk"], "risk")

    rel = estimate_reliability(x, risk)
    _assert_same(rel, exp["reliability"], "reliability")

    shift = detect_shift(x)
    _assert_same(shift, exp["shift"], "shift")

    adm = compute_admissibility(rel["reliabilityScore"], shift["normalizedDistance"])
    _assert_same(adm, exp["admissibility"], "admissibility")

    expl = explain_prediction(x)
    assert expl["topFactor"] == exp["explanation"]["topFactor"]
    assert expl["summary"] == exp["explanation"]["summary"]
    assert [
        (c["feature"], c["contribution"], c["direction"]) for c in expl["contributions"]
    ] == [(c["feature"], c["contribution"], c["direction"]) for c in exp["explanation"]["contributions"]]


def test_admissibility_grid_matches_original_on_every_branch():
    grid = DATA["admissibility_grid"]
    decisions = {g["expected"]["decision"] for g in grid}
    assert decisions == {"execute", "defer", "abstain"}
    for g in grid:
        _assert_same(compute_admissibility(g["reliability"], g["normalizedDistance"]), g["expected"],
                     f"grid({g['reliability']},{g['normalizedDistance']})")


def test_fixture_covers_multiple_severities_and_decisions():
    sev = {c["expected"]["risk"]["severity"] for c in CASES}
    dec = {c["expected"]["admissibility"]["decision"] for c in CASES}
    assert {"low", "moderate", "high"} <= sev
    assert {"defer", "abstain"} <= dec


@pytest.mark.parametrize(("x", "expected"),
                         [(0.5, 1), (1.5, 2), (2.5, 3), (-0.5, 0), (-1.5, -1), (2.4999, 2), (0.49999999999999994, 0)])
def test_js_round(x, expected):
    assert js_round(x) == expected

# AURA: what it is, what was found, what 2.0 changes

## What AURA is

Five hand-weighted heuristics from the original DADIP (`src/lib/engines/index.ts`), now in
`backend/dadip/aura/engines.py`. Nothing in them is trained: weights, bounds, reference means and variances
were set by hand.

| Module | Output | Method |
| --- | --- | --- |
| Risk | per-hazard 0–100, composite, severity | weighted sum of 12 normalised features → sigmoid |
| Reliability r(x) | 0.05–0.99 | 0.4 (1 − normalised entropy) + 0.35 feature coverage + 0.25 margin |
| Distribution shift | normalised distance D̃ₘ(x) | diagonal Mahalanobis vs hard-coded means / std devs |
| Admissibility | A(x) = r(x) · (1 − D̃ₘ(x)) | execute ≥ 0.55, defer ≥ 0.385, else abstain |
| Feature deviation | ranked inputs | weighted relative deviation from fixed baselines (not SHAP) |

## Port verification

`tests/unit/test_aura_parity.py` runs the original TypeScript under Node (`tests/parity/`) on 304 inputs
(seed 20261101: 100 uniform, 200 around the reference means, 4 edge cases) plus a 21 × 21 grid of
(r, D̃ₘ) values, and requires every output field to match. All 304 + 441 cases match.

The port initially failed one grid point: `floor(x + 0.5)` is not JavaScript's `Math.round`, because
`0.49999999999999994 + 0.5` rounds to `1.0` in binary floating point. Fixed and covered by a test.

## Finding 1 — `execute` is unreachable from real inputs

Global optimisation (`scipy.optimize.differential_evolution` over the full input bounds) finds:

| Quantity | Maximum found |
| --- | --- |
| Reliability r(x) | 0.57 |
| Admissibility A(x) | 0.48 (decision: defer) |

`execute` needs A(x) ≥ 0.55. Because entropy over five outcomes stays high whenever several hazards score
moderately, reliability cannot get much above 0.57, and A(x) = r · (1 − D̃ₘ) cannot reach 0.55. In the original
system every pipeline result is therefore `defer` or `abstain`; the `EXECUTE` decisions visible in the original
dashboard came from hard-coded values in the CSV-upload mock.

Consequence in DADIP 2.0: AURA's decision is advisory, and the approval policy (`requires_approval`) sends
every alert to a human approver. This is safe, and it is reported rather than hidden by lowering the threshold.
Recalibrating the threshold needs labelled outcomes, which the project does not have.

## Finding 2 — the original OOD flag uses the wrong scale

`isOutOfDistribution = distance > 16.92`. 16.92 is the χ² 95th percentile for **9** degrees of freedom and
applies to the **squared** distance; the code compares it with the unsquared distance over **12** features,
so the flag fires only when the squared distance exceeds ~286. The original flag is kept for parity; 2.0 adds
`distribution_shift.corrected`, which tests the squared distance against χ²₁₂(0.95) = 21.03.

## What DADIP 2.0 adds (`backend/dadip/aura/pipeline.py`)

- **No randomness.** The original filled weather and slope with `Math.random()`, so re-running an event changed
  its decision. Now inputs come from Open-Meteo at the incident location or documented defaults.
- **Provenance per input**: `observed`, `estimated` (geo heuristic or hazard prior) or `default`.
- **Sensitivity-based uncertainty**: 200 perturbations with documented noise (σ: 20% rainfall, 15% wind,
  5% humidity points, 1 °C, 2 hPa, 3° slope, 0.05 on unit-interval features), seeded from the inputs. Reports
  the 5–95% composite-risk range and decision / level stability. This measures sensitivity to input error,
  not predictive calibration.
- **Credibility v0** (`credibility.py`) for citizen reports: corroboration within 25 km / 6 h (45%),
  distance to an open incident of the same hazard (35%), description detail (20%). A transparent rule, tested
  only for monotonic behaviour; it has not been evaluated against labelled reports.

## Verified vs not verified

| Claim | Status |
| --- | --- |
| Port equals original | Verified, `test_aura_parity.py` |
| Assessments are reproducible | Verified, `test_assessment_is_deterministic`, API test |
| Live Open-Meteo request | Not verified here (sandbox blocks the host); parsing and failure paths tested with mocks |
| Credibility accuracy | Not evaluated (no labelled data) |
| Risk accuracy | Not evaluated (heuristic, no ground truth) |

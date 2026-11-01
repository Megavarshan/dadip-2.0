"""Regenerate tests/fixtures/aura_parity.json from the original TypeScript engines.

    python tests/parity/generate_fixture.py --engines ../frontend/src/lib/engines/index.ts \
        --typescript ../frontend/node_modules/typescript

Inputs are seeded (seed 20261101) plus hand-picked edge cases: every bound, zeros, rounding halves.
"""

import argparse
import json
import random
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
FIXTURE = HERE.parent / "fixtures" / "aura_parity.json"

RANGES = {
    "rainfall": (0, 320), "humidity": (0, 100), "temperature": (-15, 55), "windSpeed": (0, 260),
    "pressure": (890, 1060), "elevation": (0, 5200), "slope": (0, 90), "latitude": (-60, 60),
    "longitude": (-180, 180), "historicalDensity": (0, 1), "seismicActivity": (0, 1), "coastalProximity": (0, 1),
    "riverProximity": (0, 1), "weatherSeverity": (0, 1),
}


# The engines' own reference means / spreads (TRAIN_MEAN / TRAIN_STD in the original), used to draw inputs
# that land in the execute and defer regions, not only abstain.
CENTRE = {"rainfall": (45, 35), "humidity": (65, 18), "temperature": (28, 8), "windSpeed": (30, 25),
          "pressure": (1010, 15), "elevation": (300, 400), "slope": (15, 10), "seismicActivity": (0.3, 0.2),
          "coastalProximity": (0.25, 0.25), "riverProximity": (0.4, 0.3), "historicalDensity": (0.35, 0.2),
          "weatherSeverity": (0.35, 0.2), "latitude": (20, 8), "longitude": (79, 8)}


def make_inputs(n: int, seed: int) -> list[dict]:
    rng = random.Random(seed)
    out = [{k: round(rng.uniform(lo, hi), 3) for k, (lo, hi) in RANGES.items()} for _ in range(n // 3)]
    for i in range(n - n // 3):
        scale = 0.3 + 1.2 * (i / (n - n // 3))  # from close to the centre out to well beyond it
        out.append({k: round(mu + rng.gauss(0, sd * scale), 3) for k, (mu, sd) in CENTRE.items()})
    lows = {k: lo for k, (lo, _) in RANGES.items()}
    highs = {k: hi for k, (_, hi) in RANGES.items()}
    typical = {"rainfall": 45, "humidity": 65, "temperature": 28, "windSpeed": 30, "pressure": 1010,
               "elevation": 300, "slope": 15, "latitude": 20, "longitude": 79, "historicalDensity": 0.35,
               "seismicActivity": 0.3, "coastalProximity": 0.4, "riverProximity": 0.35, "weatherSeverity": 0.35}
    zero = dict.fromkeys(RANGES, 0)
    out += [lows, highs, typical, zero]
    return out


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--engines", required=True)
    p.add_argument("--typescript", required=True)
    p.add_argument("-n", type=int, default=300)
    a = p.parse_args()
    inputs = make_inputs(a.n, 20261101)
    res = subprocess.run(
        ["node", str(HERE / "run_original_engines.mjs"), str(Path(a.engines).resolve()),
         str(Path(a.typescript).resolve())],
        input=json.dumps(inputs), capture_output=True, text=True, check=True,
    )
    result = json.loads(res.stdout)
    outputs = result["cases"]
    FIXTURE.parent.mkdir(exist_ok=True)
    FIXTURE.write_text(json.dumps({"source": "disaster-ai@7342155 src/lib/engines/index.ts", "seed": 20261101,
                                   "cases": [{"input": i, "expected": o} for i, o in zip(inputs, outputs, strict=True)],
                                   "admissibility_grid": result["admissibilityGrid"]}))
    print(f"wrote {len(inputs)} cases to {FIXTURE}")


if __name__ == "__main__":
    main()

"""Run the communication experiments and write reproducible results.

    dadip-sim --seeds 30 --out ../simulation-results/v1
    dadip-sim --scenarios outage congestion --strategies baseline resilient --seeds 10

Outputs in --out:
  runs.csv       one row per (scenario, strategy, seed) with every metric
  summary.json   mean, std, 95% bootstrap CI per metric, plus paired differences vs baseline
  report.md      tables generated from summary.json
  metadata.json  git commit, python, platform, timestamps, command line, scenario and strategy configs
"""

import argparse
import csv
import json
import os
import platform
import random
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from datetime import UTC, datetime
from pathlib import Path

from dadip import __version__
from dadip.comms.core import STRATEGIES
from dadip.simulation.engine import SCENARIOS, run

KEY_METRICS = [
    ("delivery_ratio", "Delivery ratio", "{:.3f}"),
    ("red_delivery_ratio", "Red-alert delivery ratio", "{:.3f}"),
    ("latency_p50_s", "Latency p50 (s)", "{:.2f}"),
    ("latency_p95_s", "Latency p95 (s)", "{:.2f}"),
    ("red_latency_p95_s", "Red latency p95 (s)", "{:.2f}"),
    ("queue_wait_p95_s", "Queue wait p95 (s)", "{:.2f}"),
    ("throughput_per_s", "Throughput (alerts/s)", "{:.3f}"),
    ("duplicate_delivery_rate", "User-visible duplicate rate", "{:.3f}"),
    ("stale_deliveries", "Stale deliveries (after TTL)", "{:.1f}"),
    ("attempts_per_delivered", "Attempts per delivered alert", "{:.3f}"),
    ("recovery_backlog_drain_s", "Backlog drain after restore (s)", "{:.1f}"),
]
BOOT = 2000


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True,  # noqa: S607
                              cwd=Path(__file__).parent).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def _job(args: tuple[str, str, int]) -> dict:
    scenario, strategy, seed = args
    r = run(SCENARIOS[scenario], STRATEGIES[strategy], seed)
    return {"scenario": scenario, "strategy": strategy, "seed": seed, **r.metrics}


def bootstrap_ci(values: list[float], seed: int = 0) -> tuple[float, float]:
    rng = random.Random(seed)
    n = len(values)
    means = sorted(sum(rng.choice(values) for _ in range(n)) / n for _ in range(BOOT))
    return means[int(0.025 * BOOT)], means[int(0.975 * BOOT) - 1]


def describe(values: list[float]) -> dict | None:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    n = len(vals)
    mean = sum(vals) / n
    std = (sum((v - mean) ** 2 for v in vals) / (n - 1)) ** 0.5 if n > 1 else 0.0
    lo, hi = bootstrap_ci(vals) if n > 1 else (mean, mean)
    return {"n": n, "mean": mean, "std": std, "ci95": [lo, hi]}


def summarise(rows: list[dict]) -> dict:
    out: dict = {}
    for sc in sorted({r["scenario"] for r in rows}):
        out[sc] = {}
        by_strat = {st: {r["seed"]: r for r in rows if r["scenario"] == sc and r["strategy"] == st}
                    for st in {r["strategy"] for r in rows}}
        for st, seeds in by_strat.items():
            out[sc][st] = {m: describe([r[m] for r in seeds.values()]) for m, _, _ in KEY_METRICS}
        if "baseline" in by_strat:
            for st, seeds in by_strat.items():
                if st == "baseline":
                    continue
                diffs = {}
                for m, _, _ in KEY_METRICS:
                    d = [seeds[s][m] - by_strat["baseline"][s][m] for s in seeds
                         if s in by_strat["baseline"] and seeds[s][m] is not None
                         and by_strat["baseline"][s][m] is not None]
                    diffs[m] = describe(d)
                out[sc][f"{st}_minus_baseline"] = diffs
    return out


def _fmt(d: dict | None, fmt: str) -> str:
    if not d:
        return "n/a"
    return f"{fmt.format(d['mean'])} [{fmt.format(d['ci95'][0])}, {fmt.format(d['ci95'][1])}]"


def report(summary: dict, meta: dict) -> str:
    lines = [
        "# Communication strategy experiments",
        "",
        f"Generated {meta['finished_at']} from commit `{meta['git_commit'][:10]}` with "
        f"{meta['seeds']} seeds per cell. Values are means with bootstrap 95% confidence intervals.",
        "All results come from the discrete-event simulator in `dadip/simulation/engine.py` (a software model, "
        "not a measurement of a real cellular or radio network).",
        "",
    ]
    strategies = [s for s in ("baseline", "priority", "resilient") if s in next(iter(summary.values()))]
    for sc, data in summary.items():
        cfg = meta["scenarios"][sc]
        lines += [f"## Scenario: `{sc}`", "",
                  f"Arrivals {cfg['arrival_rate_per_s']}/s for {cfg['duration_s']:.0f} s, capacity "
                  f"{cfg['capacity_per_s']}/s, latency {cfg['latency_s']} s, loss {cfg['loss']:.0%}, "
                  f"outages {list(cfg['outages']) or 'none'}.", "",
                  "| Metric | " + " | ".join(strategies) + " |",
                  "| --- | " + " | ".join("---" for _ in strategies) + " |"]
        for m, label, fmt in KEY_METRICS:
            if all(data[s][m] is None for s in strategies):
                continue
            lines.append(f"| {label} | " + " | ".join(_fmt(data[s][m], fmt) for s in strategies) + " |")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--scenarios", nargs="*", default=list(SCENARIOS))
    p.add_argument("--strategies", nargs="*", default=list(STRATEGIES))
    p.add_argument("--seeds", type=int, default=30)
    p.add_argument("--first-seed", type=int, default=1)
    p.add_argument("--workers", type=int, default=os.cpu_count() or 2)
    p.add_argument("--out", default="simulation-results/latest")
    a = p.parse_args(argv)

    started = datetime.now(UTC)
    t0 = time.perf_counter()
    jobs = [(sc, st, seed) for sc in a.scenarios for st in a.strategies
            for seed in range(a.first_seed, a.first_seed + a.seeds)]
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        rows = list(ex.map(_job, jobs, chunksize=4))

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0].keys())
    with (out / "runs.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    summary = summarise(rows)
    meta = {
        "software_version": __version__, "git_commit": _git_commit(), "python": sys.version.split()[0],
        "platform": platform.platform(), "started_at": started.isoformat(),
        "finished_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "wall_seconds": round(time.perf_counter() - t0, 1), "command": " ".join(sys.argv),
        "seeds": a.seeds, "first_seed": a.first_seed, "runs": len(rows), "bootstrap_resamples": BOOT,
        "scenarios": {s: asdict(SCENARIOS[s]) for s in a.scenarios},
        "strategies": {s: asdict(STRATEGIES[s]) for s in a.strategies},
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    (out / "metadata.json").write_text(json.dumps(meta, indent=1))
    (out / "report.md").write_text(report(summary, meta))
    print(f"{len(rows)} runs in {meta['wall_seconds']} s -> {out}")


if __name__ == "__main__":
    main()

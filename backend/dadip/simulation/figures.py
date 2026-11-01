"""Figures for the communication experiments, drawn from summary.json only.

    python -m dadip.simulation.figures ../simulation-results/v1     (needs the `research` extra: matplotlib)
"""

import json
import sys
from pathlib import Path

ORDER = ["normal", "high_latency", "packet_loss", "load_x4", "congestion", "outage", "outage_lossy_recovery"]
STRATS = [("baseline", "#8a8f98"), ("priority", "#4f7bd9"), ("resilient", "#1f9e74")]


def _bars(ax, summary, metric, ylabel, title, scenarios=ORDER, log=False):
    import numpy as np

    x = np.arange(len(scenarios))
    w = 0.26
    for i, (st, color) in enumerate(STRATS):
        means, lo, hi = [], [], []
        for sc in scenarios:
            d = summary[sc][st][metric]
            means.append(d["mean"])
            lo.append(d["mean"] - d["ci95"][0])
            hi.append(d["ci95"][1] - d["mean"])
        ax.bar(x + (i - 1) * w, means, w, yerr=[lo, hi], capsize=2, color=color, label=st, edgecolor="none")
    ax.set_xticks(x, [s.replace("_", "\n") for s in scenarios], fontsize=8)
    ax.set_ylabel(ylabel)
    ax.set_title(title, fontsize=10, loc="left")
    if log:
        ax.set_yscale("log")
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.3)


def main(results_dir: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = Path(results_dir)
    summary = json.loads((out / "summary.json").read_text())

    fig, ax = plt.subplots(figsize=(8, 3.6))
    _bars(ax, summary, "red_delivery_ratio", "timely delivery ratio",
          "Red-alert delivery before expiry (mean, 95% CI, 30 seeds)")
    ax.set_ylim(0.6, 1.02)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="lower right", bbox_to_anchor=(1, 1))
    fig.tight_layout()
    fig.savefig(out / "fig_red_delivery.svg")
    fig.savefig(out / "fig_red_delivery.png", dpi=200)

    fig, ax = plt.subplots(figsize=(8, 3.6))
    _bars(ax, summary, "red_latency_p95_s", "seconds (log scale)",
          "Red-alert p95 latency, delivered alerts only (mean, 95% CI)", log=True)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="lower right", bbox_to_anchor=(1, 1))
    fig.tight_layout()
    fig.savefig(out / "fig_red_latency.svg")
    fig.savefig(out / "fig_red_latency.png", dpi=200)

    fig, ax = plt.subplots(figsize=(8, 3.6))
    _bars(ax, summary, "attempts_per_delivered", "attempts / delivered alert",
          "Transmission cost per delivered alert (mean, 95% CI)")
    ax.set_ylim(0.9, None)
    ax.legend(frameon=False, fontsize=8, ncol=3, loc="lower right", bbox_to_anchor=(1, 1))
    fig.tight_layout()
    fig.savefig(out / "fig_attempts.svg")
    fig.savefig(out / "fig_attempts.png", dpi=200)
    print(f"figures written to {out}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "simulation-results/latest")

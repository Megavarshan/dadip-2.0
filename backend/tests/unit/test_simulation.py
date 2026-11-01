from dataclasses import replace

from dadip.comms.core import BASELINE, PRIORITY, RESILIENT
from dadip.simulation.engine import SCENARIOS, Scenario, run
from dadip.simulation.experiments import describe, main

SHORT = Scenario("short", duration_s=120, drain_s=600)


def test_same_seed_same_result():
    a, b = run(SHORT, RESILIENT, 3).metrics, run(SHORT, RESILIENT, 3).metrics
    assert a | {"sim_wall_ms": 0} == b | {"sim_wall_ms": 0}


def test_different_seeds_differ():
    assert run(SHORT, BASELINE, 1).metrics["alerts"] != run(SHORT, BASELINE, 2).metrics["alerts"]


def test_perfect_channel_everyone_delivers_everything():
    perfect = replace(SHORT, loss=0.0, duplicate_submission_rate=0.0)
    for cfg in (BASELINE, PRIORITY, RESILIENT):
        m = run(perfect, cfg, 1).metrics
        assert m["delivery_ratio"] == 1.0 and m["duplicate_delivery_rate"] == 0.0


def test_baseline_loses_messages_sent_during_outage_resilient_does_not():
    sc = replace(SHORT, loss=0.0, outages=((30.0, 60.0),))
    base = run(sc, BASELINE, 1).metrics["delivery_ratio"]
    res = run(sc, RESILIENT, 1).metrics["delivery_ratio"]
    assert base < 0.9 and res == 1.0


def test_priority_protects_red_alerts_under_congestion():
    sc = replace(SCENARIOS["congestion"], duration_s=200, drain_s=600)
    fifo = run(sc, BASELINE, 1).metrics["red_latency_p95_s"]
    prio = run(sc, PRIORITY, 1).metrics["red_latency_p95_s"]
    assert prio < fifo / 10


def test_resilient_suppresses_duplicate_submissions():
    sc = replace(SHORT, duplicate_submission_rate=0.3, loss=0.0)
    assert run(sc, BASELINE, 1).metrics["duplicate_delivery_rate"] > 0.1
    m = run(sc, RESILIENT, 1).metrics
    assert m["duplicate_delivery_rate"] == 0.0 and m["duplicate_submissions_suppressed"] > 0


def test_red_alerts_survive_long_outage():
    """Regression: breaker probes used to exhaust the retry budget of red alerts during an outage."""
    for seed in range(1, 6):
        assert run(SCENARIOS["outage"], RESILIENT, seed).metrics["red_delivery_ratio"] == 1.0


def test_describe_ci_contains_mean():
    d = describe([1.0, 2.0, 3.0, 4.0])
    assert d["ci95"][0] <= d["mean"] <= d["ci95"][1] and d["n"] == 4


def test_runner_writes_reproducible_outputs(tmp_path):
    main(["--scenarios", "normal", "--strategies", "baseline", "resilient", "--seeds", "2", "--workers", "1",
          "--out", str(tmp_path)])
    for f in ("runs.csv", "summary.json", "metadata.json", "report.md"):
        assert (tmp_path / f).exists()
    assert "resilient_minus_baseline" in (tmp_path / "summary.json").read_text()

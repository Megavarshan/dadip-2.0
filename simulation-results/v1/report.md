# Communication strategy experiments

Generated 2026-11-01T17:43:37+00:00 from commit `22066ca684` with 30 seeds per cell. Values are means with bootstrap 95% confidence intervals.
All results come from the discrete-event simulator in `dadip/simulation/engine.py` (a software model, not a measurement of a real cellular or radio network).

## Scenario: `congestion`

Arrivals 8.0/s for 600 s, capacity 5.0/s, latency 0.15 s, loss 1%, outages none.

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.965 [0.964, 0.967] | 0.991 [0.991, 0.991] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.732 [0.718, 0.745] | 0.991 [0.990, 0.993] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 196.37 [193.73, 199.11] | 16.43 [12.84, 20.96] | 8.39 [6.72, 10.51] |
| Latency p95 (s) | 383.98 [379.13, 388.92] | 573.84 [569.14, 578.94] | 550.09 [545.11, 555.44] |
| Red latency p95 (s) | 284.64 [283.55, 285.82] | 0.67 [0.67, 0.67] | 0.69 [0.68, 0.69] |
| Queue wait p95 (s) | 385.33 [380.48, 390.31] | 573.40 [568.72, 578.51] | 549.68 [544.69, 555.03] |
| Throughput (alerts/s) | 7.708 [7.678, 7.737] | 7.914 [7.874, 7.953] | 7.986 [7.948, 8.026] |
| User-visible duplicate rate | 0.049 [0.048, 0.051] | 0.049 [0.048, 0.051] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 129.9 [121.9, 137.9] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.088 [1.085, 1.090] | 1.060 [1.058, 1.061] | 1.020 [1.019, 1.021] |

## Scenario: `high_latency`

Arrivals 2.0/s for 600 s, capacity 10.0/s, latency 2.0 s, loss 1%, outages none.

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.991 [0.991, 0.992] | 0.991 [0.991, 0.992] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.990 [0.987, 0.993] | 0.991 [0.988, 0.993] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 2.10 [2.09, 2.11] | 2.10 [2.09, 2.11] | 2.11 [2.10, 2.12] |
| Latency p95 (s) | 4.64 [4.59, 4.70] | 4.64 [4.59, 4.70] | 4.83 [4.76, 4.89] |
| Red latency p95 (s) | 4.69 [4.51, 4.89] | 4.69 [4.51, 4.90] | 4.77 [4.55, 5.00] |
| Queue wait p95 (s) | 0.09 [0.09, 0.09] | 0.08 [0.08, 0.09] | 0.08 [0.08, 0.09] |
| Throughput (alerts/s) | 1.968 [1.950, 1.984] | 1.968 [1.950, 1.984] | 1.984 [1.967, 2.001] |
| User-visible duplicate rate | 0.049 [0.047, 0.052] | 0.049 [0.047, 0.052] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.059 [1.056, 1.061] | 1.059 [1.056, 1.061] | 1.020 [1.018, 1.021] |

## Scenario: `load_x4`

Arrivals 8.0/s for 600 s, capacity 10.0/s, latency 0.15 s, loss 5%, outages none.

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.953 [0.952, 0.954] | 0.953 [0.952, 0.954] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.951 [0.946, 0.955] | 0.950 [0.946, 0.954] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 0.44 [0.43, 0.44] | 0.36 [0.35, 0.36] | 0.39 [0.39, 0.39] |
| Latency p95 (s) | 1.14 [1.07, 1.24] | 1.51 [1.43, 1.59] | 5.08 [4.72, 5.43] |
| Red latency p95 (s) | 1.13 [1.04, 1.26] | 0.45 [0.44, 0.45] | 2.55 [1.70, 3.43] |
| Queue wait p95 (s) | 0.86 [0.79, 0.96] | 1.22 [1.15, 1.30] | 2.02 [1.86, 2.21] |
| Throughput (alerts/s) | 7.609 [7.571, 7.643] | 7.608 [7.571, 7.642] | 7.986 [7.948, 8.026] |
| User-visible duplicate rate | 0.047 [0.046, 0.049] | 0.047 [0.046, 0.049] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.102 [1.100, 1.104] | 1.102 [1.100, 1.104] | 1.107 [1.105, 1.109] |

## Scenario: `normal`

Arrivals 2.0/s for 600 s, capacity 10.0/s, latency 0.15 s, loss 1%, outages none.

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.991 [0.991, 0.992] | 0.991 [0.991, 0.992] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.990 [0.987, 0.993] | 0.991 [0.988, 0.993] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 0.26 [0.26, 0.26] | 0.26 [0.26, 0.26] | 0.26 [0.26, 0.26] |
| Latency p95 (s) | 0.41 [0.41, 0.42] | 0.42 [0.41, 0.42] | 0.43 [0.42, 0.43] |
| Red latency p95 (s) | 0.42 [0.41, 0.43] | 0.41 [0.40, 0.42] | 0.42 [0.40, 0.43] |
| Queue wait p95 (s) | 0.09 [0.09, 0.09] | 0.08 [0.08, 0.09] | 0.08 [0.08, 0.09] |
| Throughput (alerts/s) | 1.968 [1.950, 1.984] | 1.968 [1.950, 1.984] | 1.984 [1.967, 2.001] |
| User-visible duplicate rate | 0.049 [0.047, 0.052] | 0.049 [0.047, 0.052] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.059 [1.056, 1.061] | 1.059 [1.056, 1.061] | 1.020 [1.018, 1.021] |

## Scenario: `outage`

Arrivals 2.0/s for 600 s, capacity 10.0/s, latency 0.15 s, loss 1%, outages [(200.0, 320.0)].

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.793 [0.788, 0.797] | 0.793 [0.788, 0.797] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.790 [0.777, 0.803] | 0.791 [0.777, 0.804] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 0.26 [0.26, 0.26] | 0.26 [0.26, 0.26] | 0.29 [0.29, 0.29] |
| Latency p95 (s) | 0.41 [0.41, 0.42] | 0.42 [0.41, 0.42] | 104.01 [102.64, 105.28] |
| Red latency p95 (s) | 0.42 [0.41, 0.43] | 0.41 [0.40, 0.42] | 89.12 [85.35, 92.68] |
| Queue wait p95 (s) | 0.09 [0.09, 0.09] | 0.08 [0.08, 0.09] | 97.11 [95.85, 98.39] |
| Throughput (alerts/s) | 1.573 [1.557, 1.588] | 1.573 [1.557, 1.588] | 1.984 [1.967, 2.001] |
| User-visible duplicate rate | 0.049 [0.046, 0.051] | 0.049 [0.046, 0.051] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.324 [1.316, 1.333] | 1.324 [1.316, 1.333] | 1.050 [1.049, 1.052] |
| Backlog drain after restore (s) | 2.2 [1.7, 2.7] | 2.2 [1.7, 2.7] | 33.0 [32.3, 33.7] |

## Scenario: `outage_lossy_recovery`

Arrivals 2.0/s for 600 s, capacity 10.0/s, latency 0.15 s, loss 10%, outages [(200.0, 320.0)].

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.725 [0.720, 0.730] | 0.725 [0.720, 0.730] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.722 [0.710, 0.734] | 0.723 [0.710, 0.735] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 0.26 [0.26, 0.26] | 0.26 [0.26, 0.26] | 0.33 [0.32, 0.33] |
| Latency p95 (s) | 0.42 [0.42, 0.42] | 0.42 [0.42, 0.43] | 110.17 [108.09, 112.25] |
| Red latency p95 (s) | 0.42 [0.41, 0.43] | 0.41 [0.40, 0.42] | 93.37 [89.31, 97.23] |
| Queue wait p95 (s) | 0.09 [0.09, 0.09] | 0.08 [0.08, 0.09] | 104.24 [102.23, 106.37] |
| Throughput (alerts/s) | 1.439 [1.424, 1.453] | 1.439 [1.424, 1.453] | 1.984 [1.967, 2.001] |
| User-visible duplicate rate | 0.043 [0.041, 0.046] | 0.043 [0.041, 0.046] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.448 [1.439, 1.458] | 1.448 [1.439, 1.458] | 1.260 [1.254, 1.265] |
| Backlog drain after restore (s) | 1.4 [1.0, 1.9] | 1.4 [1.0, 1.9] | 46.6 [44.6, 48.6] |

## Scenario: `packet_loss`

Arrivals 2.0/s for 600 s, capacity 10.0/s, latency 0.15 s, loss 20%, outages none.

| Metric | baseline | priority | resilient |
| --- | --- | --- | --- |
| Delivery ratio | 0.809 [0.804, 0.813] | 0.809 [0.804, 0.813] | 1.000 [1.000, 1.000] |
| Red-alert delivery ratio | 0.822 [0.810, 0.835] | 0.823 [0.810, 0.835] | 1.000 [1.000, 1.000] |
| Latency p50 (s) | 0.26 [0.26, 0.26] | 0.26 [0.26, 0.26] | 0.76 [0.56, 0.98] |
| Latency p95 (s) | 0.43 [0.42, 0.43] | 0.43 [0.43, 0.43] | 18.23 [17.07, 19.49] |
| Red latency p95 (s) | 0.43 [0.41, 0.45] | 0.42 [0.40, 0.44] | 13.89 [12.74, 15.12] |
| Queue wait p95 (s) | 0.09 [0.09, 0.09] | 0.08 [0.08, 0.09] | 11.02 [9.92, 12.25] |
| Throughput (alerts/s) | 1.605 [1.586, 1.623] | 1.605 [1.586, 1.623] | 1.984 [1.967, 2.001] |
| User-visible duplicate rate | 0.040 [0.037, 0.042] | 0.040 [0.037, 0.042] | 0.000 [0.000, 0.000] |
| Stale deliveries (after TTL) | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] | 0.0 [0.0, 0.0] |
| Attempts per delivered alert | 1.298 [1.292, 1.304] | 1.298 [1.293, 1.304] | 1.556 [1.547, 1.565] |

#!/usr/bin/env python3
"""Run deterministic Day 5 statistical calibration without external services."""

from __future__ import annotations

import argparse
import json
import sys
from importlib import import_module
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND if BACKEND.exists() else ROOT))

analyze_binary_metric = import_module("app.domain.analysis").analyze_binary_metric

SEED = 20261026
REPETITIONS = 1_000
ARM_SIZE = 4_000
BASELINE_RATE = 0.20
EFFECT_RATE = 0.04


def _within(value: float, limits: tuple[float, float]) -> bool:
    return limits[0] <= value <= limits[1]


def run_calibration(*, repetitions: int = REPETITIONS) -> dict[str, Any]:
    rng = np.random.default_rng(SEED)
    false_positives = 0
    covered = 0
    detected = 0
    complete = 0
    for _ in range(repetitions):
        aa_control, aa_treatment = rng.binomial(ARM_SIZE, BASELINE_RATE, size=2)
        aa = analyze_binary_metric(
            treatment_successes=int(aa_treatment),
            treatment_total=ARM_SIZE,
            control_successes=int(aa_control),
            control_total=ARM_SIZE,
            alpha=0.05,
            correction=True,
        )
        effect_control = int(rng.binomial(ARM_SIZE, BASELINE_RATE))
        effect_treatment = int(rng.binomial(ARM_SIZE, BASELINE_RATE + EFFECT_RATE))
        effect = analyze_binary_metric(
            treatment_successes=effect_treatment,
            treatment_total=ARM_SIZE,
            control_successes=effect_control,
            control_total=ARM_SIZE,
            alpha=0.05,
            correction=True,
        )
        if aa["state"] == "complete" and effect["state"] == "complete":
            complete += 1
            false_positives += int(aa["p_value"] < 0.05)
            interval = effect["confidence_interval"]
            covered += int(interval["low"] <= EFFECT_RATE <= interval["high"])
            detected += int(effect["p_value"] < 0.05)

    rates = {
        "complete_simulation_rate": complete / repetitions,
        "aa_false_positive_rate": false_positives / complete,
        "effect_interval_coverage": covered / complete,
        "effect_detection_power": detected / complete,
    }
    tolerances = {
        "complete_simulation_rate": [0.99, 1.0],
        "aa_false_positive_rate": [0.025, 0.075],
        "effect_interval_coverage": [0.92, 0.98],
        "effect_detection_power": [0.95, 1.0],
    }
    checks = {
        key: _within(rates[key], (limits[0], limits[1])) for key, limits in tolerances.items()
    }
    return {
        "calibration_version": "statistics-calibration-v1",
        "seed": SEED,
        "repetitions": repetitions,
        "complete_simulations": complete,
        "scenario": {
            "arm_size": ARM_SIZE,
            "baseline_rate": BASELINE_RATE,
            "absolute_effect": EFFECT_RATE,
            "alpha": 0.05,
            "method": "score risk-difference test and compatible score interval",
            "score_correction": True,
        },
        "rates": rates,
        "prespecified_tolerances": tolerances,
        "checks": checks,
        "passed": all(checks.values()),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--repetitions", type=int, default=REPETITIONS)
    arguments = parser.parse_args()
    result = run_calibration(repetitions=arguments.repetitions)
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result["passed"] else 1)

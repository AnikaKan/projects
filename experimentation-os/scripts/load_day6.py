#!/usr/bin/env python3
"""Measure local API nominal or bounded-overload behavior with synthetic traffic."""

from __future__ import annotations

import argparse
import json
import math
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class Observation:
    status: int
    elapsed_ms: float


def percentile(values: list[float], ratio: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * ratio) - 1))
    return round(ordered[index], 3)


def request_once(base_url: str, fault_delay_ms: int) -> Observation:
    started = time.perf_counter()
    headers = {"X-Local-Fault-Delay-Ms": str(fault_delay_ms)} if fault_delay_ms else {}
    try:
        response = httpx.get(
            f"{base_url.rstrip('/')}/health/ready",
            headers=headers,
            timeout=5,
        )
        status = response.status_code
    except httpx.HTTPError:
        status = 0
    return Observation(status=status, elapsed_ms=(time.perf_counter() - started) * 1_000)


def run(
    *, base_url: str, profile: str, requests: int, concurrency: int, fault_delay_ms: int
) -> dict[str, object]:
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        observations = list(
            executor.map(
                lambda _: request_once(base_url, fault_delay_ms),
                range(requests),
            )
        )
    elapsed = time.perf_counter() - started
    latencies = [item.elapsed_ms for item in observations]
    statuses = Counter(item.status for item in observations)
    result = {
        "profile": profile,
        "endpoint": "/health/ready",
        "requests": requests,
        "concurrency": concurrency,
        "fault_delay_milliseconds": fault_delay_ms,
        "elapsed_seconds": round(elapsed, 3),
        "achieved_requests_per_second": round(requests / elapsed, 3),
        "status_counts": {str(key): value for key, value in sorted(statuses.items())},
        "latency_milliseconds": {
            "p50": percentile(latencies, 0.50),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "max": round(max(latencies), 3),
        },
        "evidence_scope": "single-machine loopback traffic against local Docker services",
    }
    if profile == "nominal":
        result["passed"] = statuses == {200: requests}
    else:
        result["passed"] = statuses[503] > 0 and statuses[0] == 0
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--profile", choices=["nominal", "overload"], required=True)
    parser.add_argument("--requests", type=int, default=200)
    parser.add_argument("--concurrency", type=int)
    arguments = parser.parse_args()
    selected_concurrency = arguments.concurrency or (10 if arguments.profile == "nominal" else 96)
    delay = 0 if arguments.profile == "nominal" else 250
    output = run(
        base_url=arguments.base_url,
        profile=arguments.profile,
        requests=arguments.requests,
        concurrency=selected_concurrency,
        fault_delay_ms=delay,
    )
    print(json.dumps(output, indent=2, sort_keys=True))
    raise SystemExit(0 if output["passed"] else 1)

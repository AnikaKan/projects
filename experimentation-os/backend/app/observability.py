from __future__ import annotations

import threading
from collections import Counter, deque
from dataclasses import dataclass
from time import perf_counter
from typing import Any


@dataclass(frozen=True)
class RequestPermit:
    started_at: float


class OperationalMetrics:
    """Bounded, process-local request telemetry with no user or payload fields."""

    def __init__(self, *, concurrency_limit: int, sample_limit: int = 2_000) -> None:
        self._lock = threading.Lock()
        self._concurrency_limit = concurrency_limit
        self._in_flight = 0
        self._max_in_flight = 0
        self._latencies_ms: deque[float] = deque(maxlen=sample_limit)
        self._statuses: Counter[int] = Counter()
        self._overload_rejections = 0

    def begin(self) -> RequestPermit | None:
        with self._lock:
            if self._in_flight >= self._concurrency_limit:
                self._overload_rejections += 1
                self._statuses[503] += 1
                return None
            self._in_flight += 1
            self._max_in_flight = max(self._max_in_flight, self._in_flight)
        return RequestPermit(started_at=perf_counter())

    def finish(self, permit: RequestPermit, status_code: int) -> None:
        elapsed_ms = (perf_counter() - permit.started_at) * 1_000
        with self._lock:
            self._in_flight = max(0, self._in_flight - 1)
            self._latencies_ms.append(elapsed_ms)
            self._statuses[status_code] += 1

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            ordered = sorted(self._latencies_ms)
            statuses = dict(self._statuses)
            in_flight = self._in_flight
            max_in_flight = self._max_in_flight
            overload_rejections = self._overload_rejections
            concurrency_limit = self._concurrency_limit

        def percentile(ratio: float) -> float | None:
            if not ordered:
                return None
            index = min(len(ordered) - 1, max(0, int(len(ordered) * ratio) - 1))
            return round(ordered[index], 3)

        request_count = sum(statuses.values())
        error_count = sum(count for status, count in statuses.items() if status >= 500)
        return {
            "request_count": request_count,
            "error_count": error_count,
            "error_rate": error_count / request_count if request_count else 0.0,
            "status_counts": {str(key): value for key, value in sorted(statuses.items())},
            "latency_milliseconds": {
                "p50": percentile(0.50),
                "p95": percentile(0.95),
                "p99": percentile(0.99),
                "samples": len(ordered),
            },
            "in_flight": in_flight,
            "max_in_flight": max_in_flight,
            "concurrency_limit": concurrency_limit,
            "overload_rejections": overload_rejections,
            "scope": "single API process since last start",
        }

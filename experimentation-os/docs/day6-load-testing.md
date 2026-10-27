# Day 6 local load and failure profiles

These checks use synthetic loopback traffic against the Docker Compose stack and cost $0. They measure one development laptop, not a production capacity promise.

## Reproducible commands

Nominal readiness/database profile:

```sh
backend/.venv/bin/python scripts/load_day6.py --profile nominal --requests 200 --concurrency 10
```

Bounded overload profile (local-only delay injection holds requests long enough to cross the configured 64-request limit):

```sh
backend/.venv/bin/python scripts/load_day6.py --profile overload --requests 200 --concurrency 96
```

Dependency-failure and recovery profile:

```sh
docker pause experimentos-postgres-1
curl --max-time 3 -o /dev/null -w '%{http_code}\n' http://localhost:8000/health/ready
docker unpause experimentos-postgres-1
curl --retry 10 --retry-delay 1 --retry-connrefused http://localhost:8000/health/ready
```

Resource observation during the profiles:

```sh
docker stats --no-stream experimentos-api-1 experimentos-postgres-1 experimentos-localstack-1
```

The overload check passes only when requests receive explicit HTTP 503 responses with no connection failures. Dependency failure is expected to make readiness unavailable, and recovery is required after PostgreSQL resumes. Actual results belong in `docs/day6-load-results.json` and `docs/implementation-status.md`.

## Evidence boundary

The `X-Local-Fault-Delay-Ms` header is honored only in local/test environments and is capped at two seconds. It cannot be used in staging or production. LocalStack queue attributes are approximate; managed queue age and alert delivery require separate managed-service evidence. A short local run cannot establish monthly availability or a supported production traffic envelope.

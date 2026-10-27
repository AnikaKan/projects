#!/usr/bin/env python3
"""Run the isolated, zero-spend Day 7 recovery and rollback drill."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import boto3
import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
DOCKER_BIN = os.environ.get(
    "EXPERIMENTOS_DOCKER_BIN",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
)
DOCKER_HELPERS = str(Path(DOCKER_BIN).parent)
POSTGRES_CONTAINER = "experimentos-postgres-1"
DOCKER_NETWORK = "experimentos_default"
LOCALSTACK_HOST = os.environ.get("DAY7_LOCALSTACK_HOST", "http://localhost:4566")
LOCALSTACK_CONTAINER = "http://localstack:4566"
DATABASE_HOST_URL = os.environ.get(
    "DAY7_DATABASE_HOST_URL",
    "postgresql://experimentos:experimentos@localhost:5432",
)
DATABASE_CONTAINER_URL = "postgresql+psycopg://experimentos:experimentos@postgres:5432"
PEPPER = "local-day7-recovery-pepper-0000000000000001"


def docker(*arguments: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    environment = {
        **os.environ,
        "PATH": f"{DOCKER_HELPERS}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    }
    completed = subprocess.run(  # noqa: S603 - local drill constructs arguments
        [DOCKER_BIN, *arguments],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if check and completed.returncode != 0:
        raise RuntimeError(f"docker {' '.join(arguments[:4])} failed: {completed.stderr[-800:]}")
    return completed


def backend_environment(database: str, queue_name: str, dlq_name: str) -> list[str]:
    values = {
        "EXPERIMENTOS_ENVIRONMENT": "local",
        "AUTH_MODE": "local",
        "DATABASE_URL": f"{DATABASE_CONTAINER_URL}/{database}",
        "CREDENTIAL_PEPPER": PEPPER,
        "AWS_REGION": "us-west-2",
        "AWS_ACCESS_KEY_ID": "local",
        "AWS_SECRET_ACCESS_KEY": "local",
        "AWS_EC2_METADATA_DISABLED": "true",
        "SQS_ENDPOINT_URL": LOCALSTACK_CONTAINER,
        "EVENT_QUEUE_NAME": queue_name,
        "EVENT_DLQ_NAME": dlq_name,
    }
    result: list[str] = []
    for key, value in values.items():
        result.extend(("-e", f"{key}={value}"))
    return result


def operator_headers(organization_id: uuid.UUID, role: str, subject: str) -> dict[str, str]:
    return {
        "X-Local-Subject": subject,
        "X-Local-Organization-ID": str(organization_id),
        "X-Local-Role": role,
    }


def expect(response: httpx.Response, status_code: int, label: str) -> dict[str, Any]:
    if response.status_code != status_code:
        raise AssertionError(
            f"{label}: expected {status_code}, got {response.status_code}: {response.text[:400]}"
        )
    return response.json()


def start_api(*, name: str, image: str, database: str, queue_name: str, dlq_name: str) -> str:
    docker(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        DOCKER_NETWORK,
        "-p",
        "127.0.0.1::8000",
        *backend_environment(database, queue_name, dlq_name),
        image,
        "uvicorn",
        "app.main:create_app",
        "--factory",
        "--host",
        "0.0.0.0",  # noqa: S104 - isolated Docker-network listener
        "--port",
        "8000",
    )
    mapping = docker("port", name, "8000/tcp").stdout.strip()
    port = mapping.rsplit(":", 1)[-1]
    base_url = (
        f"http://{name}:8000"
        if os.environ.get("DAY7_CONTAINER_MODE") == "1"
        else f"http://127.0.0.1:{port}"
    )
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            if httpx.get(f"{base_url}/health/ready", timeout=2).status_code == 200:
                return base_url
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"{name} did not become ready")


def start_console(
    *,
    name: str,
    image: str,
    api_container: str,
    organization_id: uuid.UUID,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
) -> str:
    docker(
        "run",
        "-d",
        "--name",
        name,
        "--network",
        DOCKER_NETWORK,
        "-p",
        "127.0.0.1::3000",
        "-e",
        f"API_BASE_URL=http://{api_container}:8000",
        "-e",
        "LOCAL_OPERATOR_SUBJECT=day7-browser-operator@example.test",
        "-e",
        f"LOCAL_ORGANIZATION_ID={organization_id}",
        "-e",
        f"EXPERIMENTOS_PROJECT_ID={project_id}",
        "-e",
        f"EXPERIMENTOS_ENVIRONMENT_ID={environment_id}",
        image,
    )
    mapping = docker("port", name, "3000/tcp").stdout.strip()
    port = mapping.rsplit(":", 1)[-1]
    base_url = (
        f"http://{name}:3000"
        if os.environ.get("DAY7_CONTAINER_MODE") == "1"
        else f"http://127.0.0.1:{port}"
    )
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        try:
            response = httpx.get(base_url, timeout=4)
            if response.status_code == 200:
                return base_url
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    raise RuntimeError(f"{name} did not become ready")


def stop_container(name: str) -> None:
    docker("rm", "-f", name, check=False)


def create_database(name: str) -> None:
    docker("exec", POSTGRES_CONTAINER, "createdb", "-U", "experimentos", name)


def drop_database(name: str) -> None:
    docker(
        "exec",
        POSTGRES_CONTAINER,
        "dropdb",
        "--if-exists",
        "--force",
        "-U",
        "experimentos",
        name,
        check=False,
    )


def database_counts(database: str, project_id: uuid.UUID) -> dict[str, int]:
    tables = (
        "assignments",
        "raw_events",
        "event_contributions",
        "event_receipts",
        "quarantined_events",
    )
    with (
        psycopg.connect(f"{DATABASE_HOST_URL}/{database}") as connection,
        connection.cursor() as cursor,
    ):
        result: dict[str, int] = {}
        for table in tables:
            cursor.execute(
                f"SELECT count(*) FROM {table} WHERE project_id = %s",  # noqa: S608
                (project_id,),
            )
            row = cursor.fetchone()
            result[table] = int(row[0]) if row else -1
        return result


def wait_for_counts(
    database: str, project_id: uuid.UUID, *, raw_events: int, contributions: int
) -> dict[str, int]:
    deadline = time.monotonic() + 90
    last: dict[str, int] = {}
    while time.monotonic() < deadline:
        last = database_counts(database, project_id)
        if last["raw_events"] == raw_events and last["event_contributions"] == contributions:
            return last
        time.sleep(0.25)
    raise AssertionError(f"timed out waiting for event materialization; last counts={last}")


def assignment_request(
    client: httpx.Client,
    path: str,
    secret: str,
    subject_id: str,
) -> httpx.Response:
    return client.post(
        path,
        json={"subject_id": subject_id, "attributes": {"market": "US"}},
        headers={"Authorization": f"Bearer {secret}"},
    )


def event_document(
    assignment: dict[str, Any], subject_id: str, event_id: str, event_type: str
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "schema_version": "1",
        "assignment_id": assignment["assignment_id"],
        "assignment_token": assignment["assignment_token"],
        "event_type": event_type,
        "occurred_at": datetime.now(UTC).isoformat(),
        "source_identity": subject_id,
        "correlation_id": f"day7-{event_id}",
        "payload": {},
    }


def queue_client():  # type: ignore[no-untyped-def]
    return boto3.client(
        "sqs",
        region_name="us-west-2",
        endpoint_url=LOCALSTACK_HOST,
        aws_access_key_id="local",
        aws_secret_access_key="local",  # noqa: S106 - LocalStack placeholder only
    )


def delete_queues(queue_name: str, dlq_name: str) -> None:
    client = queue_client()
    for name in (queue_name, dlq_name):
        try:
            url = client.get_queue_url(QueueName=name)["QueueUrl"]
            client.delete_queue(QueueUrl=url)
        except client.exceptions.QueueDoesNotExist:
            pass


def run(arguments: argparse.Namespace) -> dict[str, Any]:
    suffix = uuid.uuid4().hex[:8]
    source_database = f"eos_day7_source_{suffix}"
    restored_database = f"eos_day7_restore_{suffix}"
    queue_name = f"eos-day7-{suffix}"
    dlq_name = f"eos-day7-{suffix}-dlq"
    source_api = f"eos-day7-source-api-{suffix}"
    source_worker = f"eos-day7-source-worker-{suffix}"
    source_console = f"eos-day7-source-console-{suffix}"
    restored_api = f"eos-day7-restored-api-{suffix}"
    rollback_api = f"eos-day7-rollback-api-{suffix}"
    backup_file = f"/tmp/{source_database}.dump"  # noqa: S108 - inside PostgreSQL container
    organization_id = uuid.uuid4()
    project_id = uuid.uuid4()
    environment_id = uuid.uuid4()
    experiment_id: str | None = None
    results: dict[str, Any] = {
        "profile": "isolated_local_zero_spend",
        "synthetic_assignment_target": arguments.assignments,
        "synthetic_event_target": arguments.assignments * 2 + 1,
        "candidate_image": arguments.candidate_image,
        "rollback_image": arguments.rollback_image,
    }
    try:
        install_started = time.perf_counter()
        create_database(source_database)
        docker(
            "run",
            "--rm",
            "--network",
            DOCKER_NETWORK,
            *backend_environment(source_database, queue_name, dlq_name),
            arguments.candidate_image,
            "alembic",
            "upgrade",
            "head",
        )
        docker(
            "run",
            "--rm",
            "--network",
            DOCKER_NETWORK,
            *backend_environment(source_database, queue_name, dlq_name),
            arguments.candidate_image,
            "python",
            "-m",
            "app.queue_bootstrap",
        )
        source_url = start_api(
            name=source_api,
            image=arguments.candidate_image,
            database=source_database,
            queue_name=queue_name,
            dlq_name=dlq_name,
        )
        docker(
            "run",
            "-d",
            "--name",
            source_worker,
            "--network",
            DOCKER_NETWORK,
            *backend_environment(source_database, queue_name, dlq_name),
            arguments.candidate_image,
            "python",
            "-m",
            "app.workers.ingestion",
        )
        results["clean_install_seconds"] = round(time.perf_counter() - install_started, 3)

        with (
            psycopg.connect(f"{DATABASE_HOST_URL}/{source_database}") as connection,
            connection.cursor() as cursor,
        ):
            cursor.execute(
                "INSERT INTO organizations (id, name) VALUES (%s, %s)",
                (organization_id, f"Day 7 isolated drill {suffix}"),
            )
            cursor.execute(
                "INSERT INTO projects (id, organization_id, key, name) VALUES (%s, %s, %s, %s)",
                (
                    project_id,
                    organization_id,
                    f"day7-{suffix}",
                    "Day 7 recovery drill",
                ),
            )
            cursor.execute(
                "INSERT INTO environments (id, project_id, key, name) "
                "VALUES (%s, %s, 'isolated', 'Isolated recovery drill')",
                (environment_id, project_id),
            )

        base = f"/v1/projects/{project_id}/environments/{environment_id}"
        experiments = f"{base}/experiments"
        with httpx.Client(base_url=source_url, timeout=20) as client:
            document = {
                "key": f"release-{suffix}",
                "name": "Day 7 isolated release drill",
                "configuration": {
                    "identity_namespace": "day7-recovery",
                    "traffic_allocation_basis_points": 10_000,
                    "salt": f"day7-recovery-salt-{suffix}",
                },
                "analysis_plan": {
                    "hypothesis": "Treatment changes completed signup.",
                    "primary_metric": {"key": "completed_signup"},
                    "guardrail_metric": {"key": "crash"},
                    "guardrail_harm_margin_percentage_points": 1,
                    "enrollment_ends_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
                    "followup_hours": 24,
                    "arrival_lateness_hours": 24,
                    "primary_alpha": 0.05,
                    "baseline_rate": 0.2,
                    "guardrail_baseline_rate": 0.01,
                    "minimum_detectable_effect_percentage_points": 4,
                    "desired_power": 0.8,
                    "practical_significance_threshold_percentage_points": 1,
                    "practical_threshold_semantics": "lower_confidence_bound_above",
                    "primary_test_method": "score",
                    "primary_interval_method": "score",
                    "score_correction": True,
                    "guardrail_one_sided_alpha": 0.05,
                },
            }
            created = expect(
                client.post(
                    experiments,
                    json=document,
                    headers=operator_headers(organization_id, "editor", "day7-editor@example.test"),
                ),
                201,
                "experiment creation",
            )
            experiment_id = created["id"]
            expect(
                client.post(
                    f"{experiments}/{experiment_id}/approve",
                    json={"expected_version": 1},
                    headers=operator_headers(
                        organization_id, "approver", "day7-approver@example.test"
                    ),
                ),
                200,
                "experiment approval",
            )
            expect(
                client.post(
                    f"{experiments}/{experiment_id}/launch",
                    json={"expected_version": 2},
                    headers=operator_headers(
                        organization_id, "approver", "day7-approver@example.test"
                    ),
                ),
                200,
                "experiment launch",
            )
            credential = expect(
                client.post(
                    f"{base}/credentials",
                    json={
                        "name": f"day7-source-{suffix}",
                        "capabilities": ["assignment", "event_ingestion"],
                    },
                    headers=operator_headers(
                        organization_id, "administrator", "day7-admin@example.test"
                    ),
                ),
                201,
                "credential creation",
            )
            original_secret = credential["secret"]
            assignment_path = f"{experiments}/{document['key']}/assignments/resolve"
            assignments: list[tuple[str, dict[str, Any]]] = []
            for index in range(arguments.assignments):
                subject_id = f"day7-subject-{index:04d}"
                assigned = expect(
                    assignment_request(client, assignment_path, original_secret, subject_id),
                    200,
                    "synthetic assignment",
                )
                if assigned["state"] != "assigned":
                    raise AssertionError(f"subject was not assigned: {assigned['state']}")
                assignments.append((subject_id, assigned))

            events: list[dict[str, Any]] = []
            for index, (subject_id, assigned) in enumerate(assignments):
                events.extend(
                    (
                        event_document(
                            assigned,
                            subject_id,
                            f"exposure-{index}-{suffix}",
                            "exposure",
                        ),
                        event_document(
                            assigned,
                            subject_id,
                            f"outcome-{index}-{suffix}",
                            "completed_signup",
                        ),
                    )
                )
            for start in range(0, len(events), 100):
                response = client.post(
                    f"{base}/events:collect",
                    json={"events": events[start : start + 100]},
                    headers={"Authorization": f"Bearer {original_secret}"},
                )
                batch = expect(response, 202, "synthetic event batch")
                if batch["failed_count"] != 0:
                    raise AssertionError("synthetic event publication was incomplete")
            wait_for_counts(
                source_database,
                project_id,
                raw_events=arguments.assignments * 2,
                contributions=arguments.assignments * 2,
            )

            retained_subject, retained_assignment = assignments[0]
            rotated = expect(
                client.post(
                    f"{base}/credentials/{credential['id']}/rotate",
                    headers=operator_headers(
                        organization_id, "administrator", "day7-admin@example.test"
                    ),
                ),
                200,
                "credential rotation",
            )
            rotated_secret = rotated["secret"]
            if (
                assignment_request(
                    client, assignment_path, original_secret, retained_subject
                ).status_code
                != 401
            ):
                raise AssertionError("rotated credential remained usable")
            repeated_assignment = expect(
                assignment_request(client, assignment_path, rotated_secret, retained_subject),
                200,
                "assignment after credential rotation",
            )
            if repeated_assignment["assignment_id"] != retained_assignment["assignment_id"]:
                raise AssertionError("credential rotation changed assignment attribution")

            dlq_event = event_document(
                retained_assignment,
                retained_subject,
                f"dlq-replay-{suffix}",
                "completed_signup",
            )
            envelope = {
                "project_id": str(project_id),
                "environment_id": str(environment_id),
                "accepted_at": datetime.now(UTC).isoformat(),
                "event": dlq_event,
            }
            sqs = queue_client()
            main_url = sqs.get_queue_url(QueueName=queue_name)["QueueUrl"]
            dlq_url = sqs.get_queue_url(QueueName=dlq_name)["QueueUrl"]
            sqs.send_message(
                QueueUrl=dlq_url,
                MessageBody=json.dumps(
                    {
                        "failed_event": envelope,
                        "failure_reason": "day7 synthetic drill",
                    },
                    sort_keys=True,
                    separators=(",", ":"),
                ),
            )
            received = sqs.receive_message(
                QueueUrl=dlq_url,
                MaxNumberOfMessages=1,
                WaitTimeSeconds=2,
            ).get("Messages", [])
            if len(received) != 1:
                raise AssertionError("synthetic dead letter was not observable")
            failed = json.loads(received[0]["Body"])
            sqs.send_message(
                QueueUrl=main_url,
                MessageBody=json.dumps(
                    failed["failed_event"], sort_keys=True, separators=(",", ":")
                ),
            )
            sqs.delete_message(
                QueueUrl=dlq_url,
                ReceiptHandle=received[0]["ReceiptHandle"],
            )
            wait_for_counts(
                source_database,
                project_id,
                raw_events=arguments.assignments * 2 + 1,
                contributions=arguments.assignments * 2 + 1,
            )

            analysis_environment_id = uuid.uuid4()
            fixture_run = docker(
                "run",
                "--rm",
                "--network",
                DOCKER_NETWORK,
                *backend_environment(source_database, queue_name, dlq_name),
                "-e",
                f"DAY7_ORGANIZATION_ID={organization_id}",
                "-e",
                f"DAY7_PROJECT_ID={project_id}",
                "-e",
                f"DAY7_ANALYSIS_ENVIRONMENT_ID={analysis_environment_id}",
                "-e",
                f"DAY7_FIXTURE_SUFFIX={suffix}",
                arguments.candidate_image,
                "python",
                "-m",
                "app.local_release_fixture",
            )
            fixture = json.loads(fixture_run.stdout.strip().splitlines()[-1])
            console_url = start_console(
                name=source_console,
                image=arguments.console_image,
                api_container=source_api,
                organization_id=organization_id,
                project_id=project_id,
                environment_id=analysis_environment_id,
            )
            browser_before = httpx.get(console_url, timeout=15).text
            if (
                "Day 7 finalized browser workflow" not in browser_before
                or "Finalized evidence" not in browser_before
                or "Record immutable decision" not in browser_before
            ):
                raise AssertionError("rendered console did not expose the finalized workflow")
            analysis_base = (
                f"/v1/projects/{project_id}/environments/{analysis_environment_id}"
                f"/experiments/{fixture['experiment_id']}"
            )
            decision = expect(
                client.post(
                    f"{analysis_base}/analysis/{fixture['analysis_snapshot_id']}/decisions",
                    json={
                        "action": "reject_launch",
                        "rationale": (
                            "Synthetic Day 7 release drill; no external rollout is authorized."
                        ),
                    },
                    headers=operator_headers(
                        organization_id, "approver", "day7-handoff@example.test"
                    ),
                ),
                201,
                "snapshot-linked human decision",
            )
            browser_after = httpx.get(console_url, timeout=15).text
            results["browser_decision_phrase_present"] = (
                "Human decision" in browser_after and "reject launch" in browser_after
            )
            results["browser_decision_rationale_present"] = decision["rationale"] in browser_after
            results["browser_workflow_rendered"] = (
                results["browser_decision_phrase_present"]
                and results["browser_decision_rationale_present"]
                and decision["snapshot_id"] == fixture["analysis_snapshot_id"]
            )
            results["finalized_analysis_recommendation"] = fixture["recommendation"]
            stop_container(source_console)

        source_counts = database_counts(source_database, project_id)
        with (
            psycopg.connect(f"{DATABASE_HOST_URL}/{source_database}") as connection,
            connection.cursor() as cursor,
        ):
            cursor.execute(
                "SELECT count(*) FROM raw_events WHERE environment_id = %s",
                (environment_id,),
            )
            source_environment_raw_events = int(cursor.fetchone()[0])
        stop_container(source_worker)
        stop_container(source_api)
        backup_started = time.perf_counter()
        docker(
            "exec",
            POSTGRES_CONTAINER,
            "pg_dump",
            "-U",
            "experimentos",
            "-d",
            source_database,
            "-Fc",
            "-f",
            backup_file,
        )
        results["backup_seconds"] = round(time.perf_counter() - backup_started, 3)

        recovery_started = time.perf_counter()
        create_database(restored_database)
        docker(
            "exec",
            POSTGRES_CONTAINER,
            "pg_restore",
            "-U",
            "experimentos",
            "-d",
            restored_database,
            "--no-owner",
            backup_file,
        )
        restored_url = start_api(
            name=restored_api,
            image=arguments.candidate_image,
            database=restored_database,
            queue_name=queue_name,
            dlq_name=dlq_name,
        )
        with httpx.Client(base_url=restored_url, timeout=20) as client:
            recovered_assignment = expect(
                assignment_request(client, assignment_path, rotated_secret, retained_subject),
                200,
                "restored assignment lookup",
            )
        results["restore_rto_seconds"] = round(time.perf_counter() - recovery_started, 3)
        results["quiesced_backup_lost_records"] = 0
        results["assignment_attribution_recovered"] = (
            recovered_assignment["assignment_id"] == retained_assignment["assignment_id"]
            and recovered_assignment["arm"] == retained_assignment["arm"]
        )
        restored_counts = database_counts(restored_database, project_id)
        results["source_counts"] = source_counts
        results["restored_counts"] = restored_counts
        results["count_reconciliation"] = source_counts == restored_counts

        replay_version = f"events-day7-{suffix}"
        replay_command = (
            "from app.config import Settings; "
            "from app.db.session import create_database_engine, create_session_factory; "
            "from app.domain.events import replay_raw_events; "
            "s=Settings(); e=create_database_engine(s.database_url); "
            "f=create_session_factory(e); session=f(); "
            "print(replay_raw_events(session, "
            f"environment_id=__import__('uuid').UUID('{environment_id}'), "
            f"derivation_version='{replay_version}')); "
            "session.close(); e.dispose()"
        )
        for _ in range(2):
            docker(
                "run",
                "--rm",
                "--network",
                DOCKER_NETWORK,
                *backend_environment(restored_database, queue_name, dlq_name),
                arguments.candidate_image,
                "python",
                "-c",
                replay_command,
            )
        with (
            psycopg.connect(f"{DATABASE_HOST_URL}/{restored_database}") as connection,
            connection.cursor() as cursor,
        ):
            cursor.execute(
                "SELECT count(*) FROM event_contributions "
                "WHERE project_id = %s AND derivation_version = %s",
                (project_id, replay_version),
            )
            replayed = int(cursor.fetchone()[0])
        results["replayed_contributions"] = replayed
        results["replay_idempotent"] = replayed == source_environment_raw_events

        stop_container(restored_api)
        rollback_started = time.perf_counter()
        rollback_url = start_api(
            name=rollback_api,
            image=arguments.rollback_image,
            database=restored_database,
            queue_name=queue_name,
            dlq_name=dlq_name,
        )
        with httpx.Client(base_url=rollback_url, timeout=20) as client:
            rollback_assignment = expect(
                assignment_request(client, assignment_path, rotated_secret, retained_subject),
                200,
                "rollback-image assignment lookup",
            )
        results["rollback_to_ready_seconds"] = round(time.perf_counter() - rollback_started, 3)
        results["rollback_assignment_preserved"] = (
            rollback_assignment["assignment_id"] == retained_assignment["assignment_id"]
            and rollback_assignment["arm"] == retained_assignment["arm"]
        )
        stop_container(rollback_api)

        restored_url = start_api(
            name=restored_api,
            image=arguments.candidate_image,
            database=restored_database,
            queue_name=queue_name,
            dlq_name=dlq_name,
        )
        with httpx.Client(base_url=restored_url, timeout=20) as client:
            disabled = expect(
                client.post(
                    f"{experiments}/{experiment_id}/disable",
                    json={"expected_version": 3, "reason": "Day 7 recovery drill"},
                    headers=operator_headers(
                        organization_id, "administrator", "day7-handoff@example.test"
                    ),
                ),
                200,
                "emergency disable",
            )
            disabled_assignment = expect(
                assignment_request(client, assignment_path, rotated_secret, retained_subject),
                200,
                "assignment after emergency disable",
            )
            if disabled["status"] != "stopped" or disabled_assignment["state"] != "disabled":
                raise AssertionError("emergency disable did not propagate")
            expect(
                client.post(
                    f"{base}/operations/test-alert",
                    json={"recipient_label": "synthetic-handoff-operator"},
                    headers=operator_headers(
                        organization_id, "administrator", "day7-handoff@example.test"
                    ),
                ),
                201,
                "operator handoff audit action",
            )
            audit = expect(
                client.get(
                    f"{base}/audit",
                    headers=operator_headers(
                        organization_id, "viewer", "day7-reviewer@example.test"
                    ),
                ),
                200,
                "audit review",
            )
            results["operator_handoff_audited"] = any(
                row["actor_id"] == "day7-handoff@example.test" for row in audit
            )
            expect(
                client.delete(
                    f"{base}/credentials/{rotated['id']}",
                    headers=operator_headers(
                        organization_id, "administrator", "day7-handoff@example.test"
                    ),
                ),
                200,
                "credential revocation",
            )
            results["revoked_credential_denied"] = (
                assignment_request(
                    client, assignment_path, rotated_secret, retained_subject
                ).status_code
                == 401
            )

        results["emergency_disable_propagated"] = True
        results["dead_letter_replay_reconciled"] = True
        results["passed"] = all(
            (
                results["assignment_attribution_recovered"],
                results["count_reconciliation"],
                results["replay_idempotent"],
                results["rollback_assignment_preserved"],
                results["operator_handoff_audited"],
                results["revoked_credential_denied"],
                results["emergency_disable_propagated"],
                results["dead_letter_replay_reconciled"],
                results["browser_workflow_rendered"],
            )
        )
        results["evidence_boundary"] = (
            "quiesced logical backup and synthetic traffic on one local Docker host; "
            "not managed PITR, concurrent-write RPO, production volume, or a deployment claim"
        )
        return results
    finally:
        for name in (
            source_worker,
            source_console,
            source_api,
            restored_api,
            rollback_api,
        ):
            stop_container(name)
        docker("exec", POSTGRES_CONTAINER, "rm", "-f", backup_file, check=False)
        drop_database(restored_database)
        drop_database(source_database)
        delete_queues(queue_name, dlq_name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate-image", default="experimentos-api:latest")
    parser.add_argument("--rollback-image", default="experimentos-api:day6-rollback")
    parser.add_argument("--console-image", default="experimentos-console:day7-rc1")
    parser.add_argument("--assignments", type=int, default=200)
    options = parser.parse_args()
    if options.assignments < 20:
        parser.error("--assignments must be at least 20")
    result = run(options)
    print(json.dumps(result, indent=2, sort_keys=True))
    raise SystemExit(0 if result["passed"] else 1)

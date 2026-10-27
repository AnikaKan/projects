from __future__ import annotations

import math
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    AnalysisPlan,
    Assignment,
    CohortSnapshot,
    EventContribution,
    EventExclusion,
    EventReceipt,
    Experiment,
    ExperimentStatus,
    PipelineCheckpoint,
    QuarantinedEvent,
    RawEvent,
    ReceiptStatus,
    UserFact,
)
from app.schemas import AnalysisPlanDocument

COHORT_DERIVATION_VERSION = "cohort-v1"
EXPOSURE_METRIC_KEY = "__exposure__"
SRM_P_VALUE_THRESHOLD = 0.01
SRM_MINIMUM_SAMPLE = 20


@dataclass(frozen=True)
class CohortDerivation:
    snapshot: CohortSnapshot
    created: bool


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _srm_check(control: int, treatment: int) -> dict[str, Any]:
    total = control + treatment
    if total < SRM_MINIMUM_SAMPLE:
        return {
            "state": "insufficient_sample",
            "method": "pearson_chi_square_df1",
            "p_value": None,
            "threshold": SRM_P_VALUE_THRESHOLD,
            "minimum_sample": SRM_MINIMUM_SAMPLE,
        }
    expected = total / 2
    chi_square = ((control - expected) ** 2 + (treatment - expected) ** 2) / expected
    p_value = math.erfc(math.sqrt(chi_square / 2))
    return {
        "state": "alert" if p_value < SRM_P_VALUE_THRESHOLD else "pass",
        "method": "pearson_chi_square_df1",
        "p_value": p_value,
        "threshold": SRM_P_VALUE_THRESHOLD,
        "minimum_sample": SRM_MINIMUM_SAMPLE,
    }


def _coverage_check(
    checkpoints: list[PipelineCheckpoint],
    *,
    required_start: datetime,
    required_end: datetime,
) -> dict[str, Any]:
    incomplete = [item.partition_key for item in checkpoints if not item.complete]
    complete = sorted(
        (item for item in checkpoints if item.complete), key=lambda item: _utc(item.window_start)
    )
    cursor = required_start
    gaps: list[dict[str, str]] = []
    for item in complete:
        start = _utc(item.window_start)
        end = _utc(item.window_end)
        if end <= cursor:
            continue
        if start > cursor:
            gaps.append({"start": cursor.isoformat(), "end": min(start, required_end).isoformat()})
        cursor = max(cursor, end)
        if cursor >= required_end:
            break
    if cursor < required_end:
        gaps.append({"start": cursor.isoformat(), "end": required_end.isoformat()})
    return {
        "state": "complete" if not incomplete and not gaps else "incomplete",
        "required_start": required_start.isoformat(),
        "required_end": required_end.isoformat(),
        "incomplete_partitions": incomplete,
        "coverage_gaps": gaps,
        "checkpoint_count": len(checkpoints),
    }


def record_pipeline_checkpoint(
    session: Session,
    *,
    experiment: Experiment,
    partition_key: str,
    window_start: datetime,
    window_end: datetime,
    complete: bool,
    observed_event_count: int,
    missing_reason: str | None = None,
    source_name: str = "event-ingestion",
) -> PipelineCheckpoint:
    if window_end <= window_start:
        raise ValueError("checkpoint window_end must be after window_start")
    if complete and missing_reason is not None:
        raise ValueError("complete checkpoints cannot carry a missing reason")
    existing = session.scalar(
        select(PipelineCheckpoint).where(
            PipelineCheckpoint.experiment_id == experiment.id,
            PipelineCheckpoint.source_name == source_name,
            PipelineCheckpoint.partition_key == partition_key,
        )
    )
    if existing is not None:
        raise ValueError("pipeline checkpoints are immutable; use a new partition key")
    checkpoint = PipelineCheckpoint(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        source_name=source_name,
        partition_key=partition_key,
        window_start=window_start,
        window_end=window_end,
        complete=complete,
        observed_event_count=observed_event_count,
        missing_reason=missing_reason,
    )
    session.add(checkpoint)
    session.commit()
    return checkpoint


def derive_cohort_snapshot(
    session: Session,
    *,
    experiment_id: uuid.UUID,
    derivation_version: str = COHORT_DERIVATION_VERSION,
    event_derivation_version: str = "events-v1",
    evaluated_at: datetime | None = None,
) -> CohortDerivation:
    if not derivation_version.startswith("cohort-"):
        raise ValueError("cohort derivation versions must start with cohort-")
    existing = session.scalar(
        select(CohortSnapshot).where(
            CohortSnapshot.experiment_id == experiment_id,
            CohortSnapshot.derivation_version == derivation_version,
        )
    )
    if existing is not None:
        return CohortDerivation(snapshot=existing, created=False)

    experiment = session.get(Experiment, experiment_id)
    if (
        experiment is None
        or experiment.active_configuration_version_id is None
        or experiment.active_analysis_plan_id is None
    ):
        raise ValueError("experiment and its active frozen documents are required")
    plan_row = session.get(AnalysisPlan, experiment.active_analysis_plan_id)
    if plan_row is None or plan_row.frozen_at is None:
        raise ValueError("a frozen analysis plan is required")
    if experiment.status in {ExperimentStatus.DRAFT, ExperimentStatus.APPROVED}:
        raise ValueError("cohorts require an experiment that has launched")

    plan = AnalysisPlanDocument.model_validate(plan_row.document)
    now = _utc(evaluated_at or datetime.now(UTC))
    enrollment_end = _utc(plan.enrollment_ends_at)
    arrival_cutoff = enrollment_end + timedelta(
        hours=plan.followup_hours + plan.arrival_lateness_hours
    )
    assignments = list(
        session.scalars(
            select(Assignment)
            .where(Assignment.experiment_id == experiment.id)
            .order_by(Assignment.assigned_at, Assignment.id)
        )
    )
    cohort = [item for item in assignments if _utc(item.assigned_at) <= enrollment_end]
    late_assignments = len(assignments) - len(cohort)

    raw_events = list(
        session.scalars(
            select(RawEvent)
            .join(EventContribution, EventContribution.raw_event_id == RawEvent.id)
            .where(
                RawEvent.experiment_id == experiment.id,
                EventContribution.derivation_version == event_derivation_version,
                RawEvent.ingested_at <= now,
            )
            .order_by(RawEvent.occurred_at, RawEvent.id)
        )
    )
    raw_by_assignment: dict[uuid.UUID, list[RawEvent]] = defaultdict(list)
    for raw in raw_events:
        raw_by_assignment[raw.assignment_id].append(raw)

    metric_keys = (EXPOSURE_METRIC_KEY, plan.primary_metric.key, plan.guardrail_metric.key)
    event_types = {
        EXPOSURE_METRIC_KEY: "exposure",
        plan.primary_metric.key: plan.primary_metric.key,
        plan.guardrail_metric.key: plan.guardrail_metric.key,
    }
    arm_counts: dict[str, dict[str, int]] = {
        arm: {
            "assigned": 0,
            "mature": 0,
            "exposed": 0,
            "exposure_missing": 0,
            "primary_positive": 0,
            "guardrail_positive": 0,
        }
        for arm in ("control", "treatment")
    }
    included_event_ids: set[uuid.UUID] = set()
    excluded_event_ids: set[uuid.UUID] = set()

    for assignment in cohort:
        assigned_at = _utc(assignment.assigned_at)
        window_end = assigned_at + timedelta(hours=plan.followup_hours)
        counts = arm_counts[assignment.arm]
        counts["assigned"] += 1
        if now >= window_end:
            counts["mature"] += 1
        candidates: dict[str, list[RawEvent]] = defaultdict(list)
        for raw in raw_by_assignment.get(assignment.id, []):
            occurred_at = _utc(raw.occurred_at)
            reason: str | None = None
            if occurred_at < assigned_at:
                reason = "before_assignment"
            elif occurred_at > window_end:
                reason = "after_followup_window"
            elif _utc(raw.ingested_at) > arrival_cutoff:
                reason = "arrived_after_cutoff"
            if reason is not None:
                session.add(
                    EventExclusion(
                        project_id=experiment.project_id,
                        environment_id=experiment.environment_id,
                        experiment_id=experiment.id,
                        assignment_id=assignment.id,
                        raw_event_id=raw.id,
                        event_type=raw.event_type,
                        reason=reason,
                        derivation_version=derivation_version,
                    )
                )
                excluded_event_ids.add(raw.id)
                continue
            candidates[raw.event_type].append(raw)

        for metric_key in metric_keys:
            events = candidates.get(event_types[metric_key], [])
            source = events[0] if events else None
            if source is not None:
                included_event_ids.add(source.id)
            value = source is not None
            session.add(
                UserFact(
                    project_id=experiment.project_id,
                    environment_id=experiment.environment_id,
                    experiment_id=experiment.id,
                    assignment_id=assignment.id,
                    arm=assignment.arm,
                    metric_key=metric_key,
                    value=value,
                    source_event_id=source.id if source else None,
                    window_start=assigned_at,
                    window_end=window_end,
                    derivation_version=derivation_version,
                )
            )
            if metric_key == EXPOSURE_METRIC_KEY:
                counts["exposed" if value else "exposure_missing"] += 1
            elif metric_key == plan.primary_metric.key and value:
                counts["primary_positive"] += 1
            elif metric_key == plan.guardrail_metric.key and value:
                counts["guardrail_positive"] += 1

    checkpoints = list(
        session.scalars(
            select(PipelineCheckpoint).where(PipelineCheckpoint.experiment_id == experiment.id)
        )
    )
    coverage_start = _utc(
        experiment.launched_at or (cohort[0].assigned_at if cohort else plan_row.frozen_at)
    )
    coverage = _coverage_check(
        checkpoints, required_start=coverage_start, required_end=arrival_cutoff
    )
    all_environment_raw_ids = set(
        session.scalars(
            select(RawEvent.event_id).where(RawEvent.environment_id == experiment.environment_id)
        )
    )
    stored_receipt_ids = set(
        session.scalars(
            select(EventReceipt.event_id).where(
                EventReceipt.environment_id == experiment.environment_id,
                EventReceipt.status == ReceiptStatus.STORED,
            )
        )
    )
    receipt_gaps = sorted(stored_receipt_ids - all_environment_raw_ids)
    quarantines = session.scalars(
        select(QuarantinedEvent).where(
            QuarantinedEvent.environment_id == experiment.environment_id,
            QuarantinedEvent.quarantined_at >= coverage_start,
            QuarantinedEvent.quarantined_at <= now,
        )
    ).all()
    experiment_raw_count = len(
        list(session.scalars(select(RawEvent.id).where(RawEvent.experiment_id == experiment.id)))
    )
    event_version_count = len(raw_events)
    event_replay_complete = event_version_count == experiment_raw_count
    control = arm_counts["control"]["assigned"]
    treatment = arm_counts["treatment"]["assigned"]
    srm = _srm_check(control, treatment)
    latest_ingested = max((_utc(item.ingested_at) for item in raw_events), default=None)
    maximum_ingestion_delay = max(
        (
            max(0.0, (_utc(item.ingested_at) - _utc(item.occurred_at)).total_seconds())
            for item in raw_events
        ),
        default=0.0,
    )
    checks = {
        "srm": srm,
        "exposure_loss": {
            arm: {
                "missing": values["exposure_missing"],
                "assigned": values["assigned"],
                "rate": (
                    values["exposure_missing"] / values["assigned"] if values["assigned"] else None
                ),
            }
            for arm, values in arm_counts.items()
        },
        "freshness": {
            "latest_ingested_at": latest_ingested.isoformat() if latest_ingested else None,
            "latest_ingested_age_seconds": (
                max(0.0, (now - latest_ingested).total_seconds()) if latest_ingested else None
            ),
            "maximum_ingestion_delay_seconds": maximum_ingestion_delay,
        },
        "pipeline_coverage": coverage,
        "event_replay": {
            "state": "complete" if event_replay_complete else "incomplete",
            "raw_event_count": experiment_raw_count,
            "derived_event_count": event_version_count,
            "event_derivation_version": event_derivation_version,
        },
        "receipt_reconciliation": {
            "state": "complete" if not receipt_gaps else "incomplete",
            "unmatched_event_ids": receipt_gaps,
        },
        "quarantine": {
            "state": "clear" if not quarantines else "blocked",
            "count": len(quarantines),
        },
    }
    readiness = {
        "enrollment_closed": experiment.status
        in {
            ExperimentStatus.ENROLLMENT_CLOSED,
            ExperimentStatus.FINALIZING,
            ExperimentStatus.COMPLETED,
        },
        "cohort_nonempty": bool(cohort),
        "all_subjects_mature": bool(cohort)
        and all(
            now >= _utc(item.assigned_at) + timedelta(hours=plan.followup_hours) for item in cohort
        ),
        "arrival_allowance_elapsed": now >= arrival_cutoff,
        "pipeline_complete": coverage["state"] == "complete",
        "event_replay_complete": event_replay_complete,
        "receipts_reconciled": not receipt_gaps,
        "quarantine_clear": not quarantines,
        "allocation_balance_clear": srm["state"] != "alert",
        "standard_analysis_allowed": experiment.status is not ExperimentStatus.STOPPED,
    }
    finalization_ready = all(readiness.values())
    source_counts = {
        "assignments_total": len(assignments),
        "cohort_assignments": len(cohort),
        "assignments_after_enrollment_end": late_assignments,
        "raw_events": experiment_raw_count,
        "event_contributions_for_version": event_version_count,
        "included_source_events": len(included_event_ids),
        "excluded_events": len(excluded_event_ids),
        "quarantined_events": len(quarantines),
        "stored_receipt_event_ids": len(stored_receipt_ids),
    }
    snapshot = CohortSnapshot(
        project_id=experiment.project_id,
        environment_id=experiment.environment_id,
        experiment_id=experiment.id,
        configuration_version_id=experiment.active_configuration_version_id,
        analysis_plan_id=experiment.active_analysis_plan_id,
        derivation_version=derivation_version,
        event_derivation_version=event_derivation_version,
        evaluated_at=now,
        arrival_cutoff_at=arrival_cutoff,
        source_counts=source_counts,
        arm_counts=arm_counts,
        checks=checks,
        readiness=readiness,
        finalization_ready=finalization_ready,
    )
    session.add(snapshot)
    session.commit()
    return CohortDerivation(snapshot=snapshot, created=True)

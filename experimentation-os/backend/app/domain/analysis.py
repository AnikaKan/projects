from __future__ import annotations

import math
import uuid
import warnings
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from typing import Any, Literal

from scipy.stats import norm
from sqlalchemy import select
from sqlalchemy.orm import Session
from statsmodels.stats.power import NormalIndPower
from statsmodels.stats.proportion import (
    confint_proportions_2indep,
    proportion_effectsize,
    test_proportions_2indep,
)

from app.db.models import AnalysisPlan, AnalysisSnapshot, CohortSnapshot, UserFact
from app.schemas import AnalysisPlanDocument

ANALYSIS_CODE_VERSION = "analysis-v1"
ANALYSIS_METHOD_VERSION = "score-risk-difference-v1"
DEFAULT_IMAGE_VERSION = "local-unpublished"
MINIMUM_ARM_SAMPLE = 5
REQUIRED_PLAN_FIELDS = (
    "baseline_rate",
    "guardrail_baseline_rate",
    "minimum_detectable_effect_percentage_points",
    "desired_power",
    "practical_significance_threshold_percentage_points",
    "practical_threshold_semantics",
    "primary_test_method",
    "primary_interval_method",
    "score_correction",
    "guardrail_one_sided_alpha",
)

Recommendation = Literal[
    "eligible_for_human_approval",
    "do_not_launch",
    "inconclusive",
]


class AnalysisBlocked(ValueError):
    def __init__(self, reasons: list[str]) -> None:
        super().__init__("; ".join(reasons))
        self.reasons = reasons


@dataclass(frozen=True)
class AnalysisDerivation:
    snapshot: AnalysisSnapshot
    created: bool


def _required_number(value: float | None, field: str) -> float:
    if value is None:
        raise AnalysisBlocked([f"the frozen plan is missing {field}"])
    return value


def library_versions() -> dict[str, str]:
    return {
        "numpy": version("numpy"),
        "scipy": version("scipy"),
        "statsmodels": version("statsmodels"),
    }


def _insufficient_metric(
    *,
    treatment_successes: int,
    treatment_total: int,
    control_successes: int,
    control_total: int,
    reason: str,
) -> dict[str, Any]:
    return {
        "state": "insufficient_information",
        "reason": reason,
        "treatment": {"successes": treatment_successes, "total": treatment_total},
        "control": {"successes": control_successes, "total": control_total},
        "treatment_rate": (treatment_successes / treatment_total if treatment_total else None),
        "control_rate": control_successes / control_total if control_total else None,
        "absolute_difference": None,
        "absolute_difference_percentage_points": None,
        "relative_lift": None,
        "statistic": None,
        "p_value": None,
        "confidence_interval": None,
    }


def analyze_binary_metric(
    *,
    treatment_successes: int,
    treatment_total: int,
    control_successes: int,
    control_total: int,
    alpha: float,
    alternative: Literal["two-sided", "smaller", "larger"] = "two-sided",
    null_difference: float = 0.0,
    interval_alpha: float | None = None,
    correction: bool = True,
) -> dict[str, Any]:
    counts = (treatment_successes, control_successes)
    totals = (treatment_total, control_total)
    if any(total < MINIMUM_ARM_SAMPLE for total in totals):
        return _insufficient_metric(
            treatment_successes=treatment_successes,
            treatment_total=treatment_total,
            control_successes=control_successes,
            control_total=control_total,
            reason=f"each arm requires at least {MINIMUM_ARM_SAMPLE} assigned subjects",
        )
    if any(success < 0 or success > total for success, total in zip(counts, totals, strict=True)):
        return _insufficient_metric(
            treatment_successes=treatment_successes,
            treatment_total=treatment_total,
            control_successes=control_successes,
            control_total=control_total,
            reason="success counts must be between zero and the arm total",
        )
    total_successes = sum(counts)
    total_observations = sum(totals)
    if total_successes in {0, total_observations}:
        return _insufficient_metric(
            treatment_successes=treatment_successes,
            treatment_total=treatment_total,
            control_successes=control_successes,
            control_total=control_total,
            reason="the score method is unsupported when every observed value is identical",
        )
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", RuntimeWarning)
            statistic, p_value = test_proportions_2indep(
                treatment_successes,
                treatment_total,
                control_successes,
                control_total,
                value=null_difference,
                method="score",
                compare="diff",
                alternative=alternative,
                correction=correction,
                return_results=False,
            )
            low, high = confint_proportions_2indep(
                treatment_successes,
                treatment_total,
                control_successes,
                control_total,
                method="score",
                compare="diff",
                alpha=interval_alpha if interval_alpha is not None else alpha,
                correction=correction,
            )
    except (ArithmeticError, RuntimeWarning, ValueError, ZeroDivisionError) as exc:
        return _insufficient_metric(
            treatment_successes=treatment_successes,
            treatment_total=treatment_total,
            control_successes=control_successes,
            control_total=control_total,
            reason=f"score inference was unsupported: {type(exc).__name__}",
        )
    numeric = (float(statistic), float(p_value), float(low), float(high))
    if not all(math.isfinite(value) for value in numeric):
        return _insufficient_metric(
            treatment_successes=treatment_successes,
            treatment_total=treatment_total,
            control_successes=control_successes,
            control_total=control_total,
            reason="score inference returned a non-finite value",
        )
    treatment_rate = treatment_successes / treatment_total
    control_rate = control_successes / control_total
    difference = treatment_rate - control_rate
    return {
        "state": "complete",
        "reason": None,
        "treatment": {"successes": treatment_successes, "total": treatment_total},
        "control": {"successes": control_successes, "total": control_total},
        "treatment_rate": treatment_rate,
        "control_rate": control_rate,
        "absolute_difference": difference,
        "absolute_difference_percentage_points": difference * 100,
        "relative_lift": difference / control_rate if control_rate > 0 else None,
        "statistic": numeric[0],
        "p_value": numeric[1],
        "confidence_interval": {
            "low": numeric[2],
            "high": numeric[3],
            "low_percentage_points": numeric[2] * 100,
            "high_percentage_points": numeric[3] * 100,
            "alpha": interval_alpha if interval_alpha is not None else alpha,
        },
    }


def sample_planning(plan: AnalysisPlanDocument) -> dict[str, Any]:
    if any(getattr(plan, field) is None for field in REQUIRED_PLAN_FIELDS):
        raise AnalysisBlocked(["the frozen plan is missing explicit Day 5 planning fields"])
    baseline = _required_number(plan.baseline_rate, "baseline_rate")
    mde = (
        _required_number(
            plan.minimum_detectable_effect_percentage_points,
            "minimum_detectable_effect_percentage_points",
        )
        / 100
    )
    treatment_rate = baseline + mde
    if treatment_rate >= 1:
        raise AnalysisBlocked(["baseline plus the minimum detectable effect must be below 1"])
    effect_size = proportion_effectsize(treatment_rate, baseline)
    primary_per_arm = math.ceil(
        float(
            NormalIndPower().solve_power(
                effect_size=effect_size,
                nobs1=None,
                alpha=plan.primary_alpha,
                power=_required_number(plan.desired_power, "desired_power"),
                ratio=1,
                alternative="two-sided",
            )
        )
    )
    guardrail_baseline = _required_number(plan.guardrail_baseline_rate, "guardrail_baseline_rate")
    guardrail_margin = plan.guardrail_harm_margin_percentage_points / 100
    one_sided_alpha = _required_number(plan.guardrail_one_sided_alpha, "guardrail_one_sided_alpha")
    z_value = float(norm.ppf(1 - one_sided_alpha))
    guardrail_precision_per_arm = math.ceil(
        2 * guardrail_baseline * (1 - guardrail_baseline) * (z_value / guardrail_margin) ** 2
    )
    return {
        "primary": {
            "method": "normal_independent_proportions_approximation",
            "baseline_rate": baseline,
            "target_rate": treatment_rate,
            "minimum_detectable_effect_percentage_points": (
                plan.minimum_detectable_effect_percentage_points
            ),
            "alpha": plan.primary_alpha,
            "desired_power": plan.desired_power,
            "planned_per_arm": primary_per_arm,
            "planned_total": primary_per_arm * 2,
        },
        "guardrail_precision": {
            "method": "normal_one_sided_risk_difference_precision_approximation",
            "baseline_rate": guardrail_baseline,
            "harm_margin_percentage_points": plan.guardrail_harm_margin_percentage_points,
            "one_sided_alpha": one_sided_alpha,
            "planned_per_arm": guardrail_precision_per_arm,
            "planned_total": guardrail_precision_per_arm * 2,
        },
        "label": "planning approximation; calibration and independent review required",
    }


def _fact_count(
    session: Session,
    *,
    cohort: CohortSnapshot,
    arm: str,
    metric_key: str,
    value: bool | None = None,
) -> int:
    statement = select(UserFact.id).where(
        UserFact.experiment_id == cohort.experiment_id,
        UserFact.derivation_version == cohort.derivation_version,
        UserFact.arm == arm,
        UserFact.metric_key == metric_key,
    )
    if value is not None:
        statement = statement.where(UserFact.value.is_(value))
    return len(list(session.scalars(statement)))


def _recommendation(
    *, primary: dict[str, Any], guardrail: dict[str, Any], plan: AnalysisPlanDocument
) -> Recommendation:
    if primary["state"] != "complete" or guardrail["state"] != "complete":
        return "inconclusive"
    primary_interval = primary["confidence_interval"]
    primary_degradation = primary["p_value"] < plan.primary_alpha and primary_interval["high"] < 0
    guardrail_harm = bool(guardrail["harm_confirmed"])
    if primary_degradation or guardrail_harm:
        return "do_not_launch"
    primary_improvement = primary["p_value"] < plan.primary_alpha and primary_interval["low"] > 0
    practical_threshold = (
        _required_number(
            plan.practical_significance_threshold_percentage_points,
            "practical_significance_threshold_percentage_points",
        )
        / 100
    )
    practical_met = primary_interval["low"] > practical_threshold
    if primary_improvement and practical_met and guardrail["acceptable"]:
        return "eligible_for_human_approval"
    return "inconclusive"


def derive_analysis_snapshot(
    session: Session,
    *,
    cohort_snapshot_id: uuid.UUID,
    analysis_version: str,
    code_version: str = ANALYSIS_CODE_VERSION,
    image_version: str = DEFAULT_IMAGE_VERSION,
) -> AnalysisDerivation:
    if not analysis_version.startswith("analysis-"):
        raise ValueError("analysis versions must start with analysis-")
    existing = session.scalar(
        select(AnalysisSnapshot).where(
            AnalysisSnapshot.cohort_snapshot_id == cohort_snapshot_id,
            AnalysisSnapshot.analysis_version == analysis_version,
        )
    )
    if existing is not None:
        return AnalysisDerivation(snapshot=existing, created=False)
    cohort = session.get(CohortSnapshot, cohort_snapshot_id)
    if cohort is None:
        raise AnalysisBlocked(["cohort snapshot not found"])
    if not cohort.finalization_ready:
        failed = sorted(key for key, passed in cohort.readiness.items() if not passed)
        raise AnalysisBlocked([f"cohort snapshot is not finalization-ready: {', '.join(failed)}"])
    plan_row = session.get(AnalysisPlan, cohort.analysis_plan_id)
    if plan_row is None or plan_row.frozen_at is None:
        raise AnalysisBlocked(["frozen analysis plan not found"])
    missing_fields = [field for field in REQUIRED_PLAN_FIELDS if field not in plan_row.document]
    if missing_fields:
        raise AnalysisBlocked(
            ["frozen analysis plan lacks prospective fields: " + ", ".join(missing_fields)]
        )
    plan = AnalysisPlanDocument.model_validate(plan_row.document)
    if plan.primary_test_method != "score" or plan.primary_interval_method != "score":
        raise AnalysisBlocked(["the supported initial inference contract requires score methods"])
    planning = sample_planning(plan)

    primary_counts = {
        arm: {
            "total": _fact_count(
                session, cohort=cohort, arm=arm, metric_key=plan.primary_metric.key
            ),
            "successes": _fact_count(
                session,
                cohort=cohort,
                arm=arm,
                metric_key=plan.primary_metric.key,
                value=True,
            ),
        }
        for arm in ("control", "treatment")
    }
    guardrail_counts = {
        arm: {
            "total": _fact_count(
                session, cohort=cohort, arm=arm, metric_key=plan.guardrail_metric.key
            ),
            "successes": _fact_count(
                session,
                cohort=cohort,
                arm=arm,
                metric_key=plan.guardrail_metric.key,
                value=True,
            ),
        }
        for arm in ("control", "treatment")
    }
    for arm in ("control", "treatment"):
        expected = int(cohort.arm_counts[arm]["assigned"])
        if primary_counts[arm]["total"] != expected or guardrail_counts[arm]["total"] != expected:
            raise AnalysisBlocked([f"{arm} fact counts do not reconcile to assigned subjects"])

    primary = analyze_binary_metric(
        treatment_successes=primary_counts["treatment"]["successes"],
        treatment_total=primary_counts["treatment"]["total"],
        control_successes=primary_counts["control"]["successes"],
        control_total=primary_counts["control"]["total"],
        alpha=plan.primary_alpha,
        correction=bool(plan.score_correction),
    )
    guardrail_alpha = _required_number(plan.guardrail_one_sided_alpha, "guardrail_one_sided_alpha")
    guardrail_interval_alpha = 2 * guardrail_alpha
    margin = plan.guardrail_harm_margin_percentage_points / 100
    guardrail = analyze_binary_metric(
        treatment_successes=guardrail_counts["treatment"]["successes"],
        treatment_total=guardrail_counts["treatment"]["total"],
        control_successes=guardrail_counts["control"]["successes"],
        control_total=guardrail_counts["control"]["total"],
        alpha=guardrail_alpha,
        alternative="smaller",
        null_difference=margin,
        interval_alpha=guardrail_interval_alpha,
        correction=bool(plan.score_correction),
    )
    if guardrail["state"] == "complete":
        harm_test = analyze_binary_metric(
            treatment_successes=guardrail_counts["treatment"]["successes"],
            treatment_total=guardrail_counts["treatment"]["total"],
            control_successes=guardrail_counts["control"]["successes"],
            control_total=guardrail_counts["control"]["total"],
            alpha=guardrail_alpha,
            alternative="larger",
            null_difference=margin,
            interval_alpha=guardrail_interval_alpha,
            correction=bool(plan.score_correction),
        )
        guardrail["acceptable"] = bool(
            guardrail["p_value"] < guardrail_alpha
            and guardrail["confidence_interval"]["high"] < margin
        )
        guardrail["harm_confirmed"] = bool(
            harm_test["state"] == "complete"
            and harm_test["p_value"] < guardrail_alpha
            and harm_test["absolute_difference"] > margin
        )
        guardrail["harm_test_p_value"] = harm_test.get("p_value")
        guardrail["harm_margin"] = margin
        guardrail["harm_margin_percentage_points"] = plan.guardrail_harm_margin_percentage_points
        guardrail["one_sided_alpha"] = plan.guardrail_one_sided_alpha
    else:
        guardrail.update(
            {
                "acceptable": False,
                "harm_confirmed": False,
                "harm_test_p_value": None,
                "harm_margin": margin,
                "harm_margin_percentage_points": (plan.guardrail_harm_margin_percentage_points),
                "one_sided_alpha": plan.guardrail_one_sided_alpha,
            }
        )

    if primary["state"] == "complete":
        threshold = (
            _required_number(
                plan.practical_significance_threshold_percentage_points,
                "practical_significance_threshold_percentage_points",
            )
            / 100
        )
        primary["practical_threshold"] = threshold
        primary["practical_threshold_percentage_points"] = (
            plan.practical_significance_threshold_percentage_points
        )
        primary["practical_threshold_semantics"] = plan.practical_threshold_semantics
        primary["practical_threshold_met"] = bool(primary["confidence_interval"]["low"] > threshold)
    else:
        primary["practical_threshold_met"] = False

    recommendation = _recommendation(primary=primary, guardrail=guardrail, plan=plan)
    now = datetime.now(UTC)
    libraries = library_versions()
    method_settings = {
        "method_version": ANALYSIS_METHOD_VERSION,
        "comparison": "treatment_minus_control_risk_difference",
        "primary_test_method": plan.primary_test_method,
        "primary_interval_method": plan.primary_interval_method,
        "primary_alternative": "two-sided",
        "primary_alpha": plan.primary_alpha,
        "score_correction": plan.score_correction,
        "guardrail_test": "one_sided_noninferiority_against_harm_margin",
        "guardrail_one_sided_alpha": plan.guardrail_one_sided_alpha,
        "guardrail_interval_alpha": guardrail_interval_alpha,
        "minimum_arm_sample": MINIMUM_ARM_SAMPLE,
    }
    snapshot = AnalysisSnapshot(
        project_id=cohort.project_id,
        environment_id=cohort.environment_id,
        experiment_id=cohort.experiment_id,
        configuration_version_id=cohort.configuration_version_id,
        analysis_plan_id=cohort.analysis_plan_id,
        cohort_snapshot_id=cohort.id,
        analysis_version=analysis_version,
        derivation_version=cohort.derivation_version,
        code_version=code_version,
        image_version=image_version,
        library_versions=libraries,
        cutoff_at=cohort.arrival_cutoff_at,
        source_counts={
            "cohort_snapshot_id": str(cohort.id),
            "cohort_source_counts": cohort.source_counts,
            "arm_counts": cohort.arm_counts,
        },
        checks={
            "cohort_readiness": cohort.readiness,
            "cohort_checks": cohort.checks,
            "method_settings": method_settings,
            "plan_digest": plan_row.digest,
            "quality_snapshot_finalization_ready": cohort.finalization_ready,
        },
        results={
            "primary": primary,
            "guardrail": guardrail,
            "sample_planning": planning,
            "recommendation_policy": "human_approval_required_no_automatic_rollout",
        },
        recommendation=recommendation,
        finalized_at=now,
    )
    session.add(snapshot)
    session.commit()
    return AnalysisDerivation(snapshot=snapshot, created=True)

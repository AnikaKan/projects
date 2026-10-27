# ExperimentOS statistical methods

Status: Day 5 local implementation candidate. Independent statistical review is required before production use.

## Decision contract

ExperimentOS compares treatment with control for binary outcomes in the prospectively frozen analysis plan. The confirmatory cohort is all assigned subjects in the immutable, finalization-ready Day 4 cohort snapshot. Assignment, exposure, and outcome remain separate; exposure does not redefine the primary cohort.

The system produces an evidence recommendation only. It never changes product traffic or deploys code. An authorized person must review the snapshot and make a separate, audited decision.

## Frozen inputs

Before approval, each plan explicitly records the primary and guardrail metrics, baseline rates, minimum detectable primary effect in percentage points, desired power, primary alpha, practical-significance threshold, safety harm margin, one-sided safety alpha, enrollment end, follow-up time, and arrival-lateness allowance. It also pins the test, interval, and correction settings. Approved plans are immutable; an older plan missing these inputs is blocked rather than filled with retrospective defaults.

The initial contract is:

- treatment-minus-control risk difference;
- two-sided primary score test at alpha 0.05;
- compatible score-inversion confidence interval with the same correction setting;
- practical success only when the primary interval's lower bound exceeds the frozen practical threshold;
- one-sided guardrail non-inferiority against the frozen harm margin at alpha 0.05, accompanied by a 90% two-sided score interval;
- safety only when the one-sided test passes **and** the interval's upper bound is below the harm margin.

Rates are stored as proportions and displayed differences are percentage points. Relative lift is `(treatment rate - control rate) / control rate`; it is undefined when the control rate is zero.

## Planning

Primary planning uses a two-sided independent-proportions normal approximation with equal allocation. Inputs are the frozen baseline, absolute minimum detectable effect, alpha, and desired power. Guardrail planning is reported separately as a one-sided normal precision approximation using its baseline, harm margin, and safety alpha. These calculations are planning aids, not permission to stop early or reinterpret an inconclusive result.

## Insufficient information and precedence

No interval is fabricated when an arm has fewer than five assigned subjects, a count is invalid, all observations are identical, the numerical method fails, facts do not reconcile to assigned subjects, or Day 4 readiness is incomplete. These cases are explicitly labeled `insufficient_information` or block snapshot creation.

Recommendation precedence is fixed:

1. incomplete or invalid data blocks analysis;
2. statistically supported primary degradation or guardrail harm yields `do_not_launch`;
3. a significant primary improvement whose lower confidence bound exceeds the practical threshold, together with demonstrated guardrail safety, yields `eligible_for_human_approval`;
4. every other completed case is `inconclusive`.

Failure to detect harm is not evidence of safety. A completed but inconclusive fixed-horizon study does not continue collecting confirmatory data; any further confirmatory study needs a new prospective plan.

## Reproducibility and calibration

Each immutable analysis snapshot retains its cohort, configuration, and analysis-plan IDs; cohort and analysis versions; arrival cutoff; input counts and checks; exact method settings; plan digest; application code version; container image identifier; NumPy, SciPy, and statsmodels versions; results; recommendation; and finalization time.

The dependency lock pins NumPy 2.5.4, SciPy 1.18.1, and statsmodels 0.15.0. The implementation uses statsmodels' score test and score-inversion interval for two independent proportions. Numerical fixtures independently check the observed risk difference and pooled-score statistic. `scripts/calibrate_statistics.py` uses a fixed seed and prespecified tolerances to measure A/A false-positive rate, interval coverage, and power. The committed calibration output records the actual local result.

## Known review gates

- An independent statistician has not reviewed the estimand, numerical implementation, sample-size approximations, multiplicity policy, or calibration thresholds.
- Only one primary and one guardrail binary metric are supported. There is no sequential testing, covariate adjustment, missing-data model, cluster correction, or multiple-comparison procedure.
- Local synthetic simulations do not validate real instrumentation, managed services, production traffic, or generalizability.
- Any method, library, cohort definition, or plan change requires a new explicit version and prospective review.

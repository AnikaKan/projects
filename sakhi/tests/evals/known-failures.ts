// Baseline of evaluation cases that FAIL on the current app. CI fails on any failure not listed here.
// History:
// - 2026-10-29 first run: 19 failing cases (F1–F7 in docs/EVAL_RESULTS.md).
// - 2026-10-30 after the intent / number / safety fixes: all 19 pass; baseline emptied.
// The held-out probe set (dataset/holdout.v1.json) is reported separately and is not gated.
export const KNOWN_FAILURES: Record<string, string> = {}

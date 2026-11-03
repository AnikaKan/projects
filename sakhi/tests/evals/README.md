# Evaluations

- `dataset/cases.v1.json` — 75 fictional learner turns (en/hi/te), schema in `lib/schema.ts`
- `lib/pipeline.ts` — drives the real app modules (no re-implementation)
- `lib/references.ts` — hand-computed reference amounts
- `lib/metrics.ts`, `lib/evaluate.ts` — reference-based checks, consistency sweeps, reference-free proxies
- `run.ts` — `npm run eval` → `results/latest.{json,md}`, `results/native-review.csv`
- `evals.test.ts` — CI gate (part of `npm test`)
- `known-failures.ts` — baseline of open findings (see docs/EVAL_RESULTS.md)
- `llm.ts`, `judge-prompt.md` — optional paid live-AI and LLM-judge runs (need ANTHROPIC_API_KEY + --confirm)

Plan and rubric: ../../../docs/EVAL_PLAN.md. Results: ../../../docs/EVAL_RESULTS.md.

## Multilingual round additions (2026-10-30)

- `npm run eval:consistency`: `dataset/consistency.v1.json`. 35 groups × 7 varieties (en; hi script / romanised / mixed; te script / romanised / mixed). Every variety must get the same, expected result. Gated in `evals.test.ts`. Baseline before the changes: `results/consistency-baseline.md`.
- `npm run eval:holdout2`: `dataset/holdout.v2.json` (34 cases, now seen). The first, untuned run is recorded in docs/EVAL_RESULTS.md §M1.
- `results/wording-review.csv`: lesson and UI wording flagged for native-speaker review.
- `audio/real-audio-test-sheet.csv`: manual Hindi and Telugu real-audio test script (see docs/SPEECH_VALIDATION.md).

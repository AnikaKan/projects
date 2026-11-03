# Evaluation run — 2026-11-02T00:50:57.541Z

Dataset: hisaab-saathi-holdout v3.0, 36 cases. Deterministic layer only (no model calls).

- Cases fully passed: **36/36 (100%)**
- Passed deterministic checks but final label needs a live AI run: **0**
- Failed: **0**, of which with critical failures: **0**

## Reference-based

| Metric | Result |
|---|---|
| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | 133/133 (100%) |
| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | 8/8 (100%) |
| Correct-answer classification — recall (correct answers recognised as correct) | 15/15 (100%) |
| Correct-answer classification — precision (answers marked correct that really were) | 15/15 (100%) |
| Misconception detection (exact code) | 4/4 (100%) |
| Classification overall (pending AI labels excluded) | 36/36 (100%) |
| Routing (score / confirm / prompt / AI / redirect) | 36/36 (100%) |
| Lesson progression correctness (next action) | 36/36 (100%) |
| Response schema validity (learner-facing responses) | 36/36 (100%) |
| Cross-language consistency — content sweep | 39/39 (100%) |
| Cross-language consistency — same answer in en/hi/te gives same result | — |

## Reference-free (automated proxies on approved responses — not rubric scores)

| Criterion | Proxy pass rate |
|---|---|
| clarity | 36/36 (100%) |
| tone | 36/36 (100%) |
| grounding | 36/36 (100%) |
| languageScript | 36/36 (100%) |
| length | 36/36 (100%) |
| correctiveHelpfulness | 8/8 (100%) |

## By language / category / concept

**Language:** hi 16/16 (100%) · te 16/16 (100%) · en 4/4 (100%)

**Category:** correct 13/13 (100%) · ambiguous 4/4 (100%) · misconception 4/4 (100%) · repeat_request 11/11 (100%) · code_mixed_hi_en 1/1 (100%) · unrelated 2/2 (100%) · code_mixed_te_en 1/1 (100%)

**Concept:** revenue_vs_profit 17/17 (100%) · business_expenses 5/5 (100%) · customer_credit 5/5 (100%) · business_household_separation 4/4 (100%) · savings_cash_management 5/5 (100%)

## Failed cases

| Case | Input | Critical | Failed checks |
|---|---|---|---|

## Pending (needs live AI run)


## Not run

- **liveAiResponses**: not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)
- **llmJudge**: not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)
- **nativeSpeakerReview**: not done — 32 Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns

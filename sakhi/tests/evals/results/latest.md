# Evaluation run — 2026-11-02T02:10:27.650Z

Dataset: hisaab-saathi-learner-turns v1.4, 102 cases. Deterministic layer only (no model calls).

- Cases fully passed: **102/102 (100%)**
- Passed deterministic checks but final label needs a live AI run: **0**
- Failed: **0**, of which with critical failures: **0**

## Reference-based

| Metric | Result |
|---|---|
| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | 133/133 (100%) |
| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | 30/30 (100%) |
| Correct-answer classification — recall (correct answers recognised as correct) | 37/37 (100%) |
| Correct-answer classification — precision (answers marked correct that really were) | 37/37 (100%) |
| Misconception detection (exact code) | 22/22 (100%) |
| Classification overall (pending AI labels excluded) | 102/102 (100%) |
| Routing (score / confirm / prompt / AI / redirect) | 102/102 (100%) |
| Lesson progression correctness (next action) | 102/102 (100%) |
| Response schema validity (learner-facing responses) | 102/102 (100%) |
| Cross-language consistency — content sweep | 39/39 (100%) |
| Cross-language consistency — same answer in en/hi/te gives same result | 6/6 (100%) |

## Reference-free (automated proxies on approved responses — not rubric scores)

| Criterion | Proxy pass rate |
|---|---|
| clarity | 102/102 (100%) |
| tone | 102/102 (100%) |
| grounding | 102/102 (100%) |
| languageScript | 102/102 (100%) |
| length | 102/102 (100%) |
| correctiveHelpfulness | 31/31 (100%) |

## By language / category / concept

**Language:** en 37/37 (100%) · hi 33/33 (100%) · te 32/32 (100%)

**Category:** correct 31/31 (100%) · misconception 17/17 (100%) · code_mixed_hi_en 6/6 (100%) · code_mixed_te_en 4/4 (100%) · ambiguous 14/14 (100%) · misheard_amount 4/4 (100%) · repeat_request 12/12 (100%) · unrelated 4/4 (100%) · leave_curriculum 10/10 (100%)

**Concept:** revenue_vs_profit 42/42 (100%) · business_expenses 19/19 (100%) · customer_credit 20/20 (100%) · business_household_separation 10/10 (100%) · savings_cash_management 11/11 (100%)

## Failed cases

| Case | Input | Critical | Failed checks |
|---|---|---|---|

## Pending (needs live AI run)


## Not run

- **liveAiResponses**: not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)
- **llmJudge**: not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)
- **nativeSpeakerReview**: not done — 65 Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns

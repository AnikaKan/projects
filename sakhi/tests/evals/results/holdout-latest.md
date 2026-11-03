# Evaluation run — 2026-11-02T00:50:56.452Z

Dataset: hisaab-saathi-holdout v1.0, 22 cases. Deterministic layer only (no model calls).

- Cases fully passed: **21/22 (95.5%)**
- Passed deterministic checks but final label needs a live AI run: **0**
- Failed: **1**, of which with critical failures: **0**

## Reference-based

| Metric | Result |
|---|---|
| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | 133/133 (100%) |
| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | 8/9 (88.9%) |
| Correct-answer classification — recall (correct answers recognised as correct) | 11/12 (91.7%) |
| Correct-answer classification — precision (answers marked correct that really were) | 11/11 (100%) |
| Misconception detection (exact code) | — |
| Classification overall (pending AI labels excluded) | 21/22 (95.5%) |
| Routing (score / confirm / prompt / AI / redirect) | 21/22 (95.5%) |
| Lesson progression correctness (next action) | 21/22 (95.5%) |
| Response schema validity (learner-facing responses) | 22/22 (100%) |
| Cross-language consistency — content sweep | 39/39 (100%) |
| Cross-language consistency — same answer in en/hi/te gives same result | — |

## Reference-free (automated proxies on approved responses — not rubric scores)

| Criterion | Proxy pass rate |
|---|---|
| clarity | 22/22 (100%) |
| tone | 22/22 (100%) |
| grounding | 22/22 (100%) |
| languageScript | 22/22 (100%) |
| length | 22/22 (100%) |
| correctiveHelpfulness | 1/1 (100%) |

## By language / category / concept

**Language:** en 8/8 (100%) · hi 9/9 (100%) · te 4/5 (80%)

**Category:** repeat_request 4/4 (100%) · correct 10/11 (90.9%) · ambiguous 3/3 (100%) · misheard_amount 1/1 (100%) · leave_curriculum 2/2 (100%) · unrelated 1/1 (100%)

**Concept:** revenue_vs_profit 8/9 (88.9%) · customer_credit 6/6 (100%) · business_expenses 4/4 (100%) · savings_cash_management 2/2 (100%) · business_household_separation 1/1 (100%)

## Failed cases

| Case | Input | Critical | Failed checks |
|---|---|---|---|
| RVP-TE-31 | speech: పదిహేను వందలు అమ్మకాలు, లాభం నాలుగు వందలు | — | route: got no_match_prompt, expected propose_confirm<br>correctness: got not_scored, expected correct<br>classification: got ambiguous, expected correct<br>nextAction: got stay_on_question, expected continue_assessment<br>amount: parsed nothing, expected 400 |

## Pending (needs live AI run)


## Not run

- **liveAiResponses**: not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)
- **llmJudge**: not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)
- **nativeSpeakerReview**: not done — 14 Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns

# Evaluation run — 2026-11-02T00:50:56.999Z

Dataset: hisaab-saathi-holdout v2.0, 34 cases. Deterministic layer only (no model calls).

- Cases fully passed: **32/34 (94.1%)**
- Passed deterministic checks but final label needs a live AI run: **0**
- Failed: **2**, of which with critical failures: **0**

## Reference-based

| Metric | Result |
|---|---|
| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | 133/133 (100%) |
| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | 7/8 (87.5%) |
| Correct-answer classification — recall (correct answers recognised as correct) | 16/17 (94.1%) |
| Correct-answer classification — precision (answers marked correct that really were) | 16/16 (100%) |
| Misconception detection (exact code) | 6/7 (85.7%) |
| Classification overall (pending AI labels excluded) | 32/34 (94.1%) |
| Routing (score / confirm / prompt / AI / redirect) | 32/34 (94.1%) |
| Lesson progression correctness (next action) | 32/34 (94.1%) |
| Response schema validity (learner-facing responses) | 34/34 (100%) |
| Cross-language consistency — content sweep | 39/39 (100%) |
| Cross-language consistency — same answer in en/hi/te gives same result | — |

## Reference-free (automated proxies on approved responses — not rubric scores)

| Criterion | Proxy pass rate |
|---|---|
| clarity | 34/34 (100%) |
| tone | 34/34 (100%) |
| grounding | 34/34 (100%) |
| languageScript | 34/34 (100%) |
| length | 34/34 (100%) |
| correctiveHelpfulness | 8/8 (100%) |

## By language / category / concept

**Language:** hi 15/15 (100%) · te 14/15 (93.3%) · en 3/4 (75%)

**Category:** correct 11/12 (91.7%) · code_mixed_hi_en 5/5 (100%) · repeat_request 5/5 (100%) · misconception 5/6 (83.3%) · ambiguous 2/2 (100%) · unrelated 1/1 (100%) · code_mixed_te_en 1/1 (100%) · leave_curriculum 2/2 (100%)

**Concept:** revenue_vs_profit 9/9 (100%) · business_expenses 7/7 (100%) · customer_credit 6/7 (85.7%) · business_household_separation 5/5 (100%) · savings_cash_management 5/6 (83.3%)

## Failed cases

| Case | Input | Critical | Failed checks |
|---|---|---|---|
| CRD-EN-41 | speech: seven hundred, the two hundred is still pending | — | route: got no_match_prompt, expected propose_confirm<br>correctness: got not_scored, expected correct<br>classification: got ambiguous, expected correct<br>nextAction: got stay_on_question, expected continue_assessment<br>amount: parsed nothing, expected 700 |
| SAV-TE-41 | speech: అన్నీ ఖర్చు పెట్టొచ్చు | — | route: got no_match_prompt, expected propose_confirm<br>correctness: got not_scored, expected incorrect<br>classification: got not_understood, expected misconception_spends_working_capital<br>nextAction: got stay_on_question, expected complete_assessment+recommend:savings_cash_management |

## Pending (needs live AI run)


## Not run

- **liveAiResponses**: not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)
- **llmJudge**: not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)
- **nativeSpeakerReview**: not done — 30 Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns

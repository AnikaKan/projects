# Evaluation run — 2026-11-02T00:50:58.037Z

Dataset: hisaab-saathi-holdout v4.0, 24 cases. Deterministic layer only (no model calls).

- Cases fully passed: **19/24 (79.2%)**
- Passed deterministic checks but final label needs a live AI run: **0**
- Failed: **5**, of which with critical failures: **0**

## Reference-based

| Metric | Result |
|---|---|
| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | 133/133 (100%) |
| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | 3/3 (100%) |
| Correct-answer classification — recall (correct answers recognised as correct) | 7/8 (87.5%) |
| Correct-answer classification — precision (answers marked correct that really were) | 7/7 (100%) |
| Misconception detection (exact code) | 2/2 (100%) |
| Classification overall (pending AI labels excluded) | 19/24 (79.2%) |
| Routing (score / confirm / prompt / AI / redirect) | 22/24 (91.7%) |
| Lesson progression correctness (next action) | 22/24 (91.7%) |
| Response schema validity (learner-facing responses) | 24/24 (100%) |
| Cross-language consistency — content sweep | 39/39 (100%) |
| Cross-language consistency — same answer in en/hi/te gives same result | — |

## Reference-free (automated proxies on approved responses — not rubric scores)

| Criterion | Proxy pass rate |
|---|---|
| clarity | 24/24 (100%) |
| tone | 24/24 (100%) |
| grounding | 24/24 (100%) |
| languageScript | 24/24 (100%) |
| length | 24/24 (100%) |
| correctiveHelpfulness | 4/4 (100%) |

## By language / category / concept

**Language:** hi 7/10 (70%) · te 10/11 (90.9%) · en 2/3 (66.7%)

**Category:** correct 5/6 (83.3%) · ambiguous 2/3 (66.7%) · repeat_request 6/9 (66.7%) · code_mixed_hi_en 1/1 (100%) · unrelated 2/2 (100%) · misconception 2/2 (100%) · code_mixed_te_en 1/1 (100%)

**Concept:** revenue_vs_profit 6/10 (60%) · business_expenses 3/3 (100%) · customer_credit 5/5 (100%) · savings_cash_management 2/3 (66.7%) · business_household_separation 3/3 (100%)

## Failed cases

| Case | Input | Critical | Failed checks |
|---|---|---|---|
| RVP-HI-62 | speech: क्या पता, सोचना पड़ेगा | — | route: got no_match_prompt, expected propose_confirm<br>correctness: got not_scored, expected unsure<br>classification: got unrelated, expected unsure<br>nextAction: got stay_on_question, expected continue_assessment |
| RVP-HI-64 | speech: bikri aur munafe mein kya farak hai? | — | classification: got not_understood, expected clarification_request |
| SAV-HI-61 | speech: na, kal ke maal ke liye chahiye | — | route: got no_match_prompt, expected propose_confirm<br>correctness: got not_scored, expected correct<br>classification: got not_understood, expected correct<br>nextAction: got stay_on_question, expected continue_assessment |
| RVP-TE-63 | speech: sariga vinapadaledu | — | classification: got not_understood, expected clarification_request |
| RVP-EN-61 | speech: sorry, I missed that | — | classification: got not_understood, expected clarification_request |

## Pending (needs live AI run)


## Not run

- **liveAiResponses**: not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)
- **llmJudge**: not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)
- **nativeSpeakerReview**: not done — 21 Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns

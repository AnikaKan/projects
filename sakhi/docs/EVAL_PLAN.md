# Evaluation plan: Sakhi learning companion

Owner: product/eval. Version 1.0 (2026-10-29). Code: `app/tests/evals/`. Results: `docs/EVAL_RESULTS.md`.

**Objective under test:** help women who run small stalls understand and apply five money concepts through guided, personalised, voice-first lessons in English, Hindi and Telugu.

The question the evaluation answers: **for a learner's spoken or tapped turn, does the app**
- understand it correctly,
- score it correctly,
- move the lesson correctly, and
- reply in a way that is correct, clear, respectful and in her language?

## 1. What is evaluated, in three layers

| Layer | What | How | Runs without credentials? |
|---|---|---|---|
| **L1 Deterministic pipeline** | Speech → option matching, spoken-amount parsing, scoring, misconception codes, assessment recommendation, lesson state machine, on-device screening (advice / personal data), approved feedback and fallbacks | The real app modules, driven by the dataset (`tests/evals/lib/pipeline.ts` only calls them; it re-implements nothing) | **Yes**. This is `npm run eval` and the vitest gate. |
| **L2 Generative layer** (Claude, lesson screens only) | Wording of explanations, clarifications and redirects for words that matched no answer | (a) Guard and schema tests with hand-written fixture replies (server unit tests). (b) Optional live run through the real `/api/explain` handler. | (a) yes. (b) **needs `ANTHROPIC_API_KEY` + `--confirm`**. |
| **L3 Human / native-speaker review** | Naturalness and meaning of Hindi and Telugu inputs and responses; whether learners and coordinators find replies clear and respectful | Review sheet `tests/evals/results/native-review.csv`, filled in by real reviewers | Needs people. **Not done yet.** |

Paid calls never run by default. `npm run eval:llm -- live|judge` prints a dry run unless both a key and `--confirm` are present.

## 2. Dataset: `tests/evals/dataset/cases.v1.json`

**102 fictional cases** in v1.3 (v1.0 had 75; v1.1 added 10 reliability regression cases and v1.2 added 10 multilingual regression cases, v1.3 added 7 round-2 cases, all on 2026-10-30), validated by a zod schema (`lib/schema.ts`) on every run. The per-language, per-concept and per-category tables below describe v1.0.

**By language:**

| English | Hindi | Telugu |
|---|---|---|
| 29 | 25 | 21 |

**By concept** (every concept appears in every language):

| Concept | Cases |
|---|---|
| Revenue vs profit | 30 |
| Business expenses | 15 |
| Customer credit | 13 |
| Savings and cash management | 9 |
| Business vs household money | 8 |

**By category:**

| Category | Cases |
|---|---|
| Correct | 25 |
| Misconception | 17 |
| Leave curriculum | 7 |
| Hindi-English mixed | 6 |
| Repeat request | 5 |
| Telugu-English mixed | 4 |
| Ambiguous | 4 |
| Misheard amount | 4 |
| Unrelated | 3 |

**Surfaces:** diagnostic assessment items (both parallel forms) and lesson 1 questions (response, practice, comprehension check). These are the only surfaces with approved content today.

**Each case defines:**

| Field | Meaning |
|---|---|
| `id` | e.g. `CRD-HI-02` (concept-language-number) |
| `language`, `business`, `concept`, `category` | — |
| `context` | Assessment item + attempt, or lesson question (+ earlier wrong answers) |
| `input` | `tap` option id, or `speech` transcript (what speech-to-text returned). Misheard cases also give `intendedAmount`, the amount actually said. |
| `expected.classification` | `correct`, a misconception code, `unsure`, `ambiguous`, `misheard_*`, `clarification_request`, `unrelated`, `leave_curriculum`, `sensitive_information` (v1.1 names; v1.0 used `repeat_request` / `private_data`) |
| `expected.correctness` | `correct` / `incorrect` / `unsure` / `not_scored` |
| `expected.nextAction` | e.g. `continue_assessment+flag:business_expenses`, `complete_assessment+recommend:savings_cash_management`, `feedback:corrective→retry_allowed`, `feedback:positive→continue`, `stay_on_question` |
| `expected.routes` | Acceptable handling: `score`, `propose_confirm` (spoken match shown for confirmation), `no_match_prompt`, `replay` (question re-read), `ai_interpret`, `redirect_advice`, `redirect_private` |
| `expected.amount` / `optionId` | Reference amount the words mean; reference option |
| `critical` | Critical failure conditions for this case (§4) |
| `consistencyGroup` | The same answer in en/hi/te. Results must be identical. |
| `translation` | Review status of non-English text (`needs_native_review`, with `low` or `medium` confidence). `reviewed` requires a named reviewer, which the schema enforces. |

How the expected values were set:
- They come from the product rules (PRD, ASSESSMENT.md, LESSONS.md) and hand arithmetic, **not from the app's output**.
- Amounts in `lib/references.ts` were computed by hand from the scenario inputs.
- One example: after all-correct earlier answers, a correct final answer gives `recommend:revenue_vs_profit`. The reason is the documented rule: one correct answer per concept = "emerging", so the path starts at module 1.

**Held-out probes:** written after a round of fixes and run once without tuning, to estimate generalisation. Results are reported separately and are not part of the CI gate. Write a new held-out set after each fix round, because a set stops being unseen once it has been used.

| Set | Cases | Written after | Command |
|---|---|---|---|
| `holdout.v1.json` | 22 | the reliability round (now seen) | `npm run eval:holdout` |
| `holdout.v2.json` | 34 (4 en, 15 hi, 15 te) | the multilingual round (now seen) | `npm run eval:holdout2` |
| `holdout.v3.json` | 36 (4 en, 16 hi, 16 te) | round 1, before round 2's changes (now seen) | `npm run eval:holdout3` |
| `holdout.v4.json` | 24 (3 en, 10 hi, 11 te) | round 2's changes; **still unseen and untuned** | `npm run eval:holdout4` |

v4 is the current generalisation estimate. Do not tune on it; write v5 after the next fix round.

**Language-consistency set** (`dataset/consistency.v1.json`, runner `npm run eval:consistency`):
- 46 groups (v1.1): 35 on assessment items, covering the 5 concepts × 6 intents (correct, incorrect, unsure, repeat, simpler explanation, unrelated), plus 10 on the module-1 lesson screens (response / practice / check) and 1 hedged-uncertainty group.
- Each group has the **same meaning in 7 varieties**: English; Hindi in Devanagari, romanised, and Hindi–English mixed; Telugu in script, romanised, and Telugu–English mixed.
- The check is that every variety gets the expected result **and** that all 7 get the same classification, correctness and option ("equivalent answers get equivalent scoring").
- It is gated in CI (0 critical; every group consistent).
- It was written before the multilingual code changes. Its baseline report is kept in `results/consistency-baseline.md`.

**Translation caution:** every Hindi, Telugu and code-mixed learner input was written by the developer as a plausible utterance. None has been checked by a native speaker. Five inputs are marked `low` confidence: EXP-HI-03, CRD-HI-02, CRD-TE-03, SEP-HI-03 and SAV-HI-03 (colloquial fractions such as साढ़े, romanised speech).

## 3. Reference-based metrics (L1; run automatically)

| Metric | Definition |
|---|---|
| **Financial calculation accuracy** | (a) Reference table: every derived amount of every assessment item and lesson scenario × 3 businesses equals the hand-computed value. Every language rendering shows those amounts. Every worked calculation written in lesson feedback is arithmetically true in en/hi/te. (b) Spoken-amount parsing: the parsed amount equals the meant amount (cases with `expected.amount`). |
| **Correct-answer classification** | Recall = correct answers recognised as correct. Precision = answers the app marked correct that really were correct. |
| **Misconception detection** | Cases expecting a misconception code where the app produced exactly that code. |
| **Classification overall / routing** | Exact match with expected label or route. A label only an AI layer can assign (repeat / unrelated / leave curriculum) on a lesson screen is **pending**, not passed. |
| **Lesson progression correctness** | `nextAction` matches: assessment continue / complete + recommended lesson; lesson feedback tone and retry vs continue; or stay on the question. |
| **Response schema validity** | Every learner-facing response (approved feedback, prompts, fallbacks) is checked against the same `checkShape` contract the AI layer must meet. |
| **Consistency across language versions** | (a) Content sweep: every question in en/hi/te shows the same option amounts and the same numbers in the stem and feedback. (b) Case groups: the same answer said in en/hi/te gives the same classification, correctness, next action and parsed amount. |

A case **passes** when every non-pending check passes and no critical condition is triggered.

## 4. Critical failure conditions

| Code | Meaning | Why critical |
|---|---|---|
| `SCORED_NON_ANSWER` | A request, question or personal data was used as an answer | Learner is scored on something she did not answer |
| `FALSE_CORRECT` | Marked correct when the learner was wrong, unsure or not answering | False sign of understanding; corrupts recommendations |
| `WRONG_CORRECTNESS_ON_CORRECT` | A correct answer marked wrong | Discourages a learner who was right |
| `MISCONCEPTION_MISSED` | Scored, but with the wrong misconception code | Wrong lesson recommended |
| `PROPOSED_WRONG_AMOUNT` | A spoken amount was turned into a *different offered* amount | A low-literacy learner may confirm the wrong choice |
| `MISHEARD_AUTO_SCORED` | Speech scored without a confirmation step | Speech errors become scores |
| `ILLEGAL_PROGRESSION` | Lesson or assessment moved further than the rules allow | Breaks the deterministic curriculum |
| `PRIVATE_DATA_SENT` | Words with phone, account or ID numbers sent to the AI endpoint | Privacy |
| `ADVICE_NOT_REDIRECTED` | Loan or investment request sent to the AI instead of the approved redirect | Out of curriculum; relies on the model |

A triggered code is critical if the case lists it, or if it is one of the global codes (`SCORED_NON_ANSWER`, `FALSE_CORRECT`, `PRIVATE_DATA_SENT`, `MISHEARD_AUTO_SCORED`). Otherwise it is reported as a warning.

## 5. Reference-free evaluation

### 5a. Automated proxies (run now, on every response the pipeline produces)

These are pass/fail heuristics, **not quality scores**. Passing them means "no obvious defect".

| Criterion | Automated proxy |
|---|---|
| Clarity | Longest sentence ≤ 25 words; no jargon from a per-language list (e.g. *revenue, net profit, working capital*, *राजस्व, शुद्ध लाभ*, *నికర లాభం*) |
| Respectful tone | No blaming or condescending words (en/hi/te lists, whole words only) |
| Grounding in approved curriculum | Every ₹ amount is one of the question's validated amounts; written arithmetic is true; no lending/investment topic (except in the approved advice redirect) |
| Language appropriateness | Script check: en = Latin only; hi ≥ 50% Devanagari, no Telugu; te ≥ 50% Telugu, no Devanagari |
| Response length | ≤ 320 characters and ≤ 4 sentences (voice-first) |
| Helpfulness of corrective feedback | For incorrect or unsure answers: shows the correct amount, a worked calculation, or at least one explaining sentence |

### 5b. Rubric (for human reviewers and the optional LLM judge)

Scale 1–4 per criterion. Full anchors are in `tests/evals/judge-prompt.md`.

| Criterion | 4 | 3 | 2 | 1 |
|---|---|---|---|---|
| Clarity | One idea per sentence, everyday words, understood on first hearing | Clear, one long or abstract sentence | Needs effort; textbook terms | Confusing or contradictory |
| Respectful tone | Warm, adult-to-adult, normalises mistakes | Neutral, polite | Condescending, childish or cold | Blames or shames |
| Grounding | Only approved facts and amounts | Faithful plus a harmless generic addition | Unapproved fact or amount | Wrong fact or calculation, or financial advice |
| Language appropriateness | Natural for language and script; English loanwords only where sellers use them | Correct but formal or literal | Wrong register or awkward translation | Wrong language or script, or meaning changed |
| Length | 1–3 short sentences | Slightly long | Key point buried | Far too long or useless |
| Corrective helpfulness | Names the mix-up kindly and shows the way with lesson numbers | Gives answer or rule, not why | Vague "try again" | Misleading |

**Acceptance targets** (proposed; to agree with the NGO before the pilot):
- Mean ≥ 3.5 on every criterion.
- No response scored 1 on grounding or tone.
- Zero critical flags.

### 5c. Optional LLM-as-a-judge (`npm run eval:llm -- judge --confirm`)

1. **Inputs.** The judge receives each response from `results/latest.json` (and live AI responses, if a live run was done) with:
   - the case (language, business, concept, what the learner said, the app's decision)
   - the approved amounts
   - the rubric prompt
2. **Output.** Structured JSON (`output_config.format`): six scores, critical flags, `uncertain_language`, and a short rationale. Model: `EVAL_JUDGE_MODEL`, default `claude-sonnet-5-5`.
3. **How to use it.**
   - Treat judge scores as a model's opinion.
   - Calibrate first: before trusting it, compare the judge on ≥ 30 responses that real reviewers also scored. Report agreement (exact and ±1).
   - Use it to triage, not to sign off.
   - Hindi and Telugu naturalness is **never** accepted from the judge alone.

### 5d. Native-speaker evaluation (L3)

1. `npm run eval` writes `results/native-review.csv`: every Hindi, Telugu and code-mixed input with the app's response. The reviewer columns (natural input? meaning correct? natural and respectful? reviewer name, notes) are left empty.
2. A case's `translation.status` changes to `reviewed` only with a named reviewer.
3. Suggested minimum: 2 native reviewers per language who live in or near the programme districts, plus 1 field coordinator per language.

**Automated checks vs native review:** script ratio, number agreement and jargon lists are automated. Naturalness, register, correct meaning of colloquial amounts (साढ़े, డెబ్బై) and cultural appropriateness need native speakers.

## 6. How to run

```bash
cd app
npm run eval                      # L1: writes tests/evals/results/latest.{json,md}, native-review.csv
npm run eval:holdout              # held-out probes v1 (report only)
npm run eval:holdout2             # held-out probes v2 (report only)
npm run eval:holdout3             # held-out probes v3 (report only)
npm run eval:holdout4             # held-out probes v4 (report only; unseen)
npm run test:e2e                  # 9 browser suites (needs a running build + server)
npm run eval:consistency          # en/hi/te equivalence: results/consistency-latest.{json,md}
npm test                          # includes tests/evals/evals.test.ts (CI gate)
npm run typecheck:evals
npm run eval:llm -- live          # dry run; add --confirm with ANTHROPIC_API_KEY to call Claude (3 lesson cases)
npm run eval:llm -- judge         # dry run; add --confirm to score all responses with the rubric
```

**CI gate** (`tests/evals/evals.test.ts`) fails on:
- an invalid dataset or missing coverage
- any calculation or cross-language mismatch in the content sweeps
- a critical failure or an inconsistent group in the language-consistency set
- an invalid, wrong-script or ungrounded response
- private data or advice sent to the model
- **any failing case not listed in `tests/evals/known-failures.ts`**

The baseline lists the open findings. Remove an entry when its fix lands; the runner reports known failures that now pass.

## 7. Limits of this plan

- Inputs are speech-to-text *transcripts*. Audio, accents and real STT error rates are not tested here. The manual real-audio test plan and sheet for Hindi and Telugu, covering background noise and spoken currency amounts, are in `SPEECH_VALIDATION.md`; that test is still pending.
- Native-speaker review of the learner copy and of the recognised phrases follows `MULTILINGUAL_REVIEW.md`; it is still pending.
- Lesson content exists only for module 1. Modules 2–5 are covered through assessment items only.
- The dataset was written by one developer. It needs expansion with real (consented, anonymised) learner utterances from field tests.

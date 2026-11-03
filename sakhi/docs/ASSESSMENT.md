# Diagnostic Assessment & Lesson Recommendation

**Status:** Implemented in the prototype (`app/src/assessment/`) · **Last updated:** 2026-10-28
**Companion to:** PRD P0-5, ARCHITECTURE §3–4, USER_FLOW §2

## 1. What it does
The learner answers 3–5 short questions, one at a time. Each question uses her own business (vegetable stall, tea stall or grocery shop). After every answer she gets supportive feedback. At the end she sees one recommended lesson and a plain-language picture of where she is starting from. All scoring and recommendations are **deterministic code**; no AI is involved.

## 2. Concepts and items

| # | Concept | Lesson (module) | Form A (attempts 1, 3, …) | Form B (attempts 2, 4, …) |
|---|---|---|---|---|
| 1 | `revenue_vs_profit` | m1 Sales and profit | Yes/No: "Is your profit ₹{sales}?" (brief, example 1) | Amount: "How much profit did you make?" |
| 2 | `business_expenses` | m2 Everyday costs | Choice: which is a business expense (stock vs school fees vs festival clothes) | Amount: stock + auto fare total |
| 3 | `customer_credit` | m3 Customer credit | Yes/No: "Is that ₹{amount} cash you received today?" (brief, example 2) | Amount: cash in box when part was sold on udhaar |
| 4 | `business_household_separation` | m5 Two pockets | Yes/No: "Should this be recorded separately?" (brief, example 3) | Choice: where home money should come from |
| 5 | `savings_cash_management` | m4 Saving a little daily | Yes/No: can you spend money needed for tomorrow's stock? | Choice: where to keep savings |

- **Length:** 5 questions by default. A 3-question version (for when time is short) keeps revenue vs profit, customer credit and home/shop money. Any length outside 3–5 is rejected.
- **Retry:** a retry uses the parallel form, so no question repeats on the very next attempt.
- **Every item** has exactly one correct option, plus an "I'm not sure" option. Amount options are always different from each other. All amounts are fictional whole rupees.
- **Only `approved` items are served.** Only `approved` lessons are recommended. Approval is the in-app content status. Real sign-off by the NGO curriculum lead, and native-speaker review of the Hindi and Telugu wording, are still needed before field use.

## 3. Misconception taxonomy

| Code | Concept | Severity | What the learner is likely thinking |
|---|---|---|---|
| `misconception_revenue_vs_profit` | revenue_vs_profit | 3 | All sales money is profit |
| `misconception_profit_adds_costs` | revenue_vs_profit | 3 | Costs are added to sales instead of subtracted |
| `misconception_household_as_business_expense` | business_expenses | 2 | Home spending counts as a business cost |
| `misconception_ignores_hidden_costs` | business_expenses | 2 | Transport and other small costs are left out |
| `misconception_credit_as_cash` | customer_credit | 3 | Udhaar counts as cash already received |
| `misconception_mixes_business_household` | business_household_separation | 2 | Home money is taken from the cash box without keeping track |
| `misconception_spends_working_capital` | savings_cash_management | 3 | Money needed for tomorrow's stock can be spent today |
| `misconception_savings_mixed_with_cash` | savings_cash_management | 1 | Savings are kept mixed with the shop cash |

Each answer is classified as one of three kinds: `understands_<concept>`, `unsure_<concept>`, or one of the misconception codes above. This matches the classifications in the brief's examples.

## 4. Scoring rules (deterministic)
1. **Scoring uses option IDs.** The language and the input method (tap or voice) are recorded for audit but never affect the score.
2. **Concept level** comes from the latest attempt, combined with earlier attempts:
   - Latest answer shows a misconception → `gap`
   - Latest answer is "not sure" → `unsure`
   - Latest answer is correct → `emerging`
   - `consistent` needs **two correct answers on different items** across attempts, with the last two both correct.
   - There is **no "mastered" level.** A single correct answer is never more than "Good start".
3. **Recommendation:** concepts are ranked `gap` → `unsure` → `not_assessed` → the rest. Ties are broken by misconception severity, then by concept order. The first concept with an approved lesson wins. If every answer is correct, the recommendation is the next lesson in the path that hasn't been completed. Any other concepts that need work are listed under "Coming up after this".

## 5. Feedback wording (never critical)
- **Correct:** "That's right." plus a short explanation that includes the worked sum, e.g. ₹500 − ₹300 = ₹200.
- **Misconception:** "Many shop owners think this too." plus the explanation, plus "We'll practise this in your lessons."
- **Not sure:** "That's okay. We'll learn this together." plus the explanation.
- After answering, the correct option is shown in green. The learner's own choice is never marked in red.

## 6. Languages
- All questions, options, explanations, feedback and recommendation text exist in en-IN, hi-IN and te-IN (`assessment/i18n.ts`).
- **Templates contain no numbers.** Amounts are filled in from `bank.ts`, so the calculations are the same in every language. Tests check that the same amounts appear in every language for every item and business.
- Switching language mid-assessment keeps the current question, any answer already selected, and the score.

## 7. Storage, resume and retry
- Saved on the device only (`localStorage`, with an in-memory fallback), under `hisaab.assessment.v1.<learnerId>`.
- Only option IDs and classifications are stored. No free text, no financial details about the learner.
- Each answer is saved straight away, so an assessment interrupted mid-way can be **resumed** at the next question or **started again**.
- Corrupted or outdated stored data is discarded rather than crashing the app.

## 8. Voice-ready design
`voice.ts` defines the step after speech-to-text: transcript → deterministic resolver → learner confirmation ("Did you say …?") → the same `scoreAnswer()` used for taps.
- The resolver handles yes/no and "not sure" words in all three languages, including romanised forms (haan, avunu, ledu, pata nahi…).
- It matches spoken amounts written as digits ("₹300", "1,000 rupees") and option labels for choice questions.
- Low confidence, contradictory answers or unknown amounts → `no_match`, and the learner taps instead.
- An optional `AnswerMapper` interface leaves room for an AI fallback that may only return one of the given option IDs.
- **Not built yet:** speech-to-text itself (the prototype simulates a transcript) and amounts spoken as words ("teen sau").

## 9. Tests (Vitest; run with `npm test`)
117 tests in 4 files:

| File | Tests | What it covers |
|---|---|---|
| `engine.test.ts` | 34 | The brief's 3 examples (exact wording and classifications); question selection (3–5, parallel forms, drafts never served); all-correct; every misconception option; ranking and alsoReview; unsure vs misconception; consistent needs 2 different items; regression to gap; incomplete sessions; approved-only lessons |
| `content.test.ts` | 63 | Matching translation keys and slots; no amounts written into translations; rendering × 3 businesses × 3 languages with identical numbers; identical scoring across languages for 4 answer patterns × 3 businesses × 2 attempts; item-quality rules |
| `storage-voice.test.ts` | 16 | Save and resume; learners kept separate; corrupted data; retry; storage that throws; voice resolver in en/hi/te; voice and tap score the same |
| `AssessmentFlow.test.tsx` | 4 | UI in jsdom: one question at a time and supportive feedback; switching language mid-question; resume and start again after leaving; retry uses new questions and the result is stored |

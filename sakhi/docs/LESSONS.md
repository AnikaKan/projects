# Personalised Lesson Experience

**Status:** Implemented for Module 1 "Sales and profit" (`app/src/learning/`) · **Last updated:** 2026-10-28
**Companion to:** PRD P0-6 to P0-11, ARCHITECTURE §3–4, ASSESSMENT.md

## 1. Primary demo
A vegetable seller answers "Yes" to *"You sold ₹500 of vegetables and spent ₹300 on them. Is your profit ₹500?"* in the diagnostic. The assessment flags `misconception_revenue_vs_profit` and recommends the Sales and profit lesson. The lesson then:

- Names the misconception kindly.
- Teaches the difference: ₹500 − ₹300 = **₹200 left** after the vegetables sold, and other costs (spoilage ₹40, auto fare ₹30) bring the **final profit to ₹130**.
- Gives practice and checks understanding.
- Assigns a weekly activity.

## 2. State machine (`learning/machine.ts`)
```
assessment_result → intro → example → response ─ANSWER→ feedback ─NEXT→ practice → check → challenge → complete
                                        ↑              │ RETRY (wrong answer, attempts left)
                                        └──────────────┘
practice: ANSWER → feedback shown in place → RETRY (max 2 attempts) or NEXT
check:    ANSWER once → feedback → NEXT
REPEAT and EXPLAIN_ANOTHER_WAY work on every step before completion
```
- The machine is pure and typed. Events are `NEXT`, `ANSWER`, `RETRY`, `REPEAT`, `EXPLAIN_ANOTHER_WAY`, `ACCEPT_CHALLENGE` and `NOT_NOW`.
- An event that isn't allowed at the current step returns the **same state object** and does nothing. For example: skipping a question, answering twice, retrying after a correct answer, or retrying the comprehension check.
- `complete` is final. No event changes it.

| # | State | What the learner sees |
|---|---|---|
| 1 | assessment_result | "From your answers, it looked like all the sales money was counted as profit. Many sellers think this way." If the assessment found no misconception, a general welcome instead |
| 2 | intro | Sales vs profit in one or two sentences. Three "explain another way" versions, one specific to her business |
| 3 | example | Her business's numbers, two amount bars (sales split into goods + what's left, then into goods + other costs + profit), and a credit (udhaar) note for grocery |
| 4 | response | One question with tap options, including "I'm not sure" |
| 5 | feedback | Feedback that matches her answer: a positive message, or a gentle correction aimed at the specific misconception. Offers Try again (up to 2 attempts) and Explain another way |
| 6 | practice | A second scenario that includes other costs. Feedback in place, one retry |
| 7 | check | A transfer question answered once: "sales went up; did profit go up?" (it went down) |
| 8 | challenge | A practical activity for 3 evenings at the stall. "I'll do this" or "Not now" |
| 9 | complete | Result message, the rule "Profit = Sales − all costs", and whether the activity was saved |

## 3. Personalisation by business (same structure, different numbers and words)

| | Vegetable stall | Tea stall | Grocery shop |
|---|---|---|---|
| Example | ₹500 sales − ₹300 mandi vegetables = **₹200**; spoilage ₹40 + auto ₹30 → profit ₹130 | ₹600 − ₹350 milk/tea leaves/sugar = **₹250**; gas ₹60 → ₹190 | ₹1,500 − ₹1,200 stock = **₹300**; bags/transport ₹50 → ₹250; ₹200 of sales on udhaar |
| Practice | ₹800 − ₹450 − spoilage ₹50 − auto ₹30 = **₹270** | ₹900 − ₹450 − gas ₹80 = **₹370** | ₹2,000 − ₹1,500 − ₹100 = **₹400** |
| Check | ₹500/₹300 → ₹700/₹550: profit ₹200 → ₹150 | ₹600/₹350 → ₹800/₹600: ₹250 → ₹200 | ₹1,500/₹1,200 → ₹1,800/₹1,550: ₹300 → ₹250 |

All amounts are fictional whole rupees, defined once in `content/revenueVsProfit.ts` and computed by `learning/calc.ts`.

## 4. Answer key and misconceptions (reuses the assessment taxonomy)
- **Response:** the amount left ✓ · the sales amount → `misconception_revenue_vs_profit` · sales + cost → `misconception_profit_adds_costs` · not sure
- **Practice:** profit ✓ · amount left after goods only → `misconception_ignores_hidden_costs` · the sales amount → `misconception_revenue_vs_profit` · not sure
- **Check:** "No, profit went down" ✓ · "Yes, because sales went up" → `misconception_revenue_vs_profit` · not sure

For each misconception, the lesson tracks whether it was **observed**, **resolved** (a correct answer came later) or still **open**. This includes the misconception carried in from the assessment.

**Result** (never "mastered"):
- `understood`: practice right first time and check right. App level becomes *Practising*.
- `developing`: one of the two right. Level becomes *Learning*.
- `needs_review`: neither right. Level becomes *Learning*, and the coach will review it with her.

## 5. Content and languages
- `content/revenueVsProfit.text.ts` holds all learner text in en-IN, hi-IN and te-IN.
- React components contain no lesson text, only rendering. Templates use `{slots}`, so every number comes from code and matches across languages.
- Feedback is encouraging ("Many sellers think this", "Nearly there!", "That's okay"). A test blocks blaming words (wrong / incorrect / गलत / తప్పు).
- Hindi and Telugu are drafts that still need native-speaker review.

## 6. Saving, resuming, completion
- Progress is saved on the device after every event, under `hisaab.lesson.v1.<learnerId>.<lessonId>`.
- Reopening an unfinished lesson asks "Continue where you left off?" or "Start again".
- On completion the app records the module as completed, sets the matching progress level, and pins the lesson's weekly activity to Home, Progress and the Coach View.
- Presentation demo links (`?demo=example|corrective|practice|challenge`) replay real machine events into a separate in-memory store. They never change the learner's real progress.

## 7. Tests and verification (actual results, 2026-10-28)
- **`npm test`:** 162 passed in 7 files. 45 of these are new lesson tests:
  - `machine.test.ts` (18): calculations, all 9 states in order, the PRD demo path, incorrect paths, guards, Repeat and Explain another way, save and resume
  - `content.test.ts` (21): matching translation keys and slots, business vocabulary, identical amounts and answers in every language, bars that add up to sales, no blaming words
  - `LessonExperience.test.tsx` (6): UI correct path, incorrect-then-recovered path, incorrect path with no recovery, resume, switching to Telugu mid-question, tea and grocery variants
- **`npm run build`:** passes.
- **Browser check** (Playwright, 375px):
  - English vegetable stall: assessment → recommendation → lesson with wrong-then-right answers → `developing` → challenge pinned on Home
  - Telugu tea stall, all correct → `understood`
  - Hindi grocery shop: reload partway through → resume at the same step
  - No console errors, nothing scrolling sideways, no untranslated text showing

## 8. Not yet built
- Lessons for Modules 2–5. They open a placeholder screen even when the assessment recommends them.
- Recorded audio: Repeat is simulated.
- Voice answers inside the lesson. The assessment's voice resolver can be reused.
- Sending lesson misconceptions to the Coach View flags. They are stored in the lesson state but not yet merged into the roster.

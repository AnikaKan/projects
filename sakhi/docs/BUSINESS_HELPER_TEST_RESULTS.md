# Business Helper: test results

**Date:** 2026-11-01.

**Build:** production build served by `vite preview`. The backend has **no API keys**.

**Scope of these results:**
- All tests are automated.
- Where voice is exercised, the browser speech engines are **simulated**: test doubles in unit tests, and `fake-speech.cjs` in the browser.
- **No real speech and no learners were involved.**

## Summary

| Check | Result |
|---|---|
| Unit + integration (`npx vitest run`) | **704 / 704** in 34 files (14 new Business Helper tests, 9 new demo tests) |
| Type check + production build | OK |
| Browser suites (`npm run test:e2e`) | **12 / 12**, including the new **helper-e2e (23 / 23)** and **demo-e2e (22 / 22)**. Learner journey 55 / 55; Coach View 32 / 32 |
| Evaluations (main / consistency) | 102 / 102 · all categories 100%. Unchanged |

## Requirements → evidence

| # | Requirement | Result | Where |
|---|---|---|---|
| 1 | The Business Helper tab opens correctly | ✅ The tab is shown, opens `#/helper`, and shows the welcome and 4 cards | helper.test; helper-e2e |
| 2 | Existing tabs still work | ✅ Today and My learning are still there; learner journey 55 / 55 | helper.test; primary-journey |
| 3 | Existing lessons and Coach View unchanged | ✅ Lesson, Coach View and progress suites all pass; no changes to their code | test:e2e; git diff |
| 4 | The `/demo` route still works | ✅ demo-e2e 22 / 22; helper-e2e opens `#/demo` | demo-e2e; helper-e2e |
| 5 | Check My Price calculates correctly | ✅ 450 − 300 − 50 = 100 (covers); break-even; loss (−20, "₹30 short" after a correction); invalid and too-large amounts refused | helper.test; helper-e2e |
| 6 | Understand My Money separates sales, cash, credit and profit | ✅ 500 / 400 → owed 100, with the exact sentence from the brief; received > sales refused; sales / profit, expenses and household scenarios checked | helper.test; helper-e2e |
| 7 | Users can correct inputs | ✅ ✏️ Change on every input row, returning to the result; spoken amounts are only used after confirmation; a correction that invalidates a later answer re-asks it | helper.test |
| 8 | English, Hindi, Telugu | ✅ All keys exist in all three languages (type check + test); screens render in hi / te with no overflow at 360 px | helper.test; helper-e2e |
| 9 | Voice playback uses the selected language | ✅ Telugu Listen → `te-IN` utterance; English amount read-back → `en-IN` ("Is it 250 rupees?") | helper.test; helper-e2e. **Simulated synthesiser** |
| 10 | Microphone failures give usable alternatives | ✅ Permission denied → notice and the keypad works; several or no amounts are not guessed | helper.test |
| 11 | Return to the helper home | ✅ Back from steps and results | helper.test |
| 12 | Lesson links open the right module | ✅ Price → m1; "no other costs" or "not sure" → m2; udhaar → m3; home money → m5 (honest "with coach" screen) | helper.test; helper-e2e |
| 13 | Learner progress preserved | ✅ No new records; the store is byte-identical after a full money flow | helper.test; helper-e2e |
| 14 | No sensitive financial data stored | ✅ Amounts are never written anywhere; > ₹1,00,000 refused | helper.test |
| + | Voice routing | ✅ "check my selling price" → price tool (en / hi / te keyword tests); loan → coming soon with no advice; unsupported → options shown, no chatbot answer | helper.test; helper-e2e |
| + | No advice wording | ✅ No helper string (except the loan card's own disclaimer) triggers the advice-topic guard | helper.test |

## Limitations

- **Real speech recognition** of amounts in Hindi and Telugu is **untested**. Use the 43-prompt sheet in `tests/evals/audio/` with real speakers.
- "No other costs" said aloud is not yet understood; the button is offered instead.
- **Item pictures and wording** are not reviewed by learners or coordinators. Hindi and Telugu are drafts (W43).
- **Not in the app yet:**
  - Customer Message and Understand a Loan are **coming soon** only.
  - There is no bookkeeping.
  - No practice outcomes are stored.

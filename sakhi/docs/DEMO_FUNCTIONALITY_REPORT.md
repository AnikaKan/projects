# Presentation demo (`#/demo`): functionality report

**Date:** 2026-11-01.

**Code:**
- `src/demo/demoModel.ts` (logic)
- `src/demo/PresentationDemo.tsx` (screens)

**Tests:**
- `src/demo/__tests__/demo.test.tsx` (9 tests)
- `tests/e2e/demo-e2e.cjs` (22 browser checks)

**Git:**
- Checkpoint commit on `main` before this work.
- The work is on branch `feature/demo-and-business-helper`.

## Real, simulated, unavailable

| Feature | Status | Detail |
|---|---|---|
| Language screen: 6 languages | **Real UI** | English, हिन्दी, తెలుగు select a language. বাংলা, অসমীয়া, தமிழ் are marked "Coming soon" and do not change anything |
| Hindi / Telugu demo question | **Real, draft wording** | Developer translations, not native-reviewed |
| Read question + choices aloud | **Real browser text-to-speech** (Web Speech API) | Depends on the computer having an English (India) or English voice. If none: a clear "No English voice" notice. Amounts are spoken as words ("500 rupees") |
| Microphone answer | **Real browser speech recognition** where the browser supports it (Chrome / Edge) | In Chrome, audio is processed by the browser vendor's online service. Needs internet and microphone permission. Unsupported browser or denied permission: a clear notice and tap answers |
| Showing what was heard; confirm before it counts | **Real** | The existing voice answer panel. The heard words can be corrected |
| "Repeat" / "I don't understand" | **Real** (existing intent rules) | Not counted as answers; "repeat" reads the question again |
| Scoring | **Real engine** | `startAssessment` / `submitAnswer` / `finalize` on a one-item session of approved item `rvp_a_is_sales_profit`. The demo shows a plainer wording of that item; its Yes / No / Not sure → outcome rules are unchanged |
| Level | **Real rule, applied honestly** | Foundational when the sales-and-profit anchor question is not right (the diagnostic's own gate rule). After a correct answer: "not yet known", because one question cannot place her |
| Recommendation | **Real** (`recommend()`) | Yes → Sales and profit (misconception). Not sure → Sales and profit (unsure). No → Everyday costs (next topic) |
| ₹500 / ₹300 / ₹200 picture | **Real data** | From the item bank's vegetable-stall values. ₹200 is labelled "before other expenses", not profit |
| Coach View: why / struggled / reinforce | **Real rules + fixed wording** | Built from the recorded answer: rule id from the coaching engine (R1 / R2 / R4), evidence = the one diagnostic answer, plus how it was given (spoken words, or "Tapped"). Guidance text is fixed per outcome; no AI is used. No extra history is invented |
| Isolation | **Real** | The demo runs inside its own in-memory app state. Its stage is kept in `sessionStorage` (`hs-presentation-demo.v1`) so a page reload does not lose the presentation. Real learner records are never read or written (tested) |
| Reset demo | **Real** | Clears only the demo's session key |
| AI | **Not used** in the demo | — |
| Full 5-question diagnostic, lessons, progress | **Not part of the demo** | Available in the normal app |

## Acceptance criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Six languages shown | ✅ unit + browser |
| 2 | English opens the diagnostic immediately | ✅ |
| 3 | Question plays as English audio | ✅ Verified with a **simulated** speech synthesiser (4 utterances, `en-IN`: the question, then each choice). Real audio depends on the presenting computer; check it before the talk |
| 4 | Choices can be heard | ✅ Same as 3, plus a 🔊 button per choice |
| 5 | "Yes" is recognised | ✅ With a **simulated** recognition engine (unit and browser). Real recognition was not tested here (headless browser, no microphone) |
| 6 | "No" gives a different result | ✅ Everyday costs, no misconception, level not known |
| 7 | "Repeat" / "I don't understand" are not answers | ✅ |
| 8 | Recommendation matches the answer | ✅ |
| 9 | Coach View shows the same evidence | ✅ Option and source (spoken words / tapped) |
| 10 | Coaching activity is specific | ✅ ₹500 / ₹300 picture, one question, one goal |
| 11 | Reset without deleting learner data | ✅ Real records byte-identical before and after |
| 12 | Original app still works | ✅ 690 unit tests; 11 / 11 browser suites, including the 55-check learner journey and the 32-check Coach View suite |

## Shared files changed (minimal)

| File | Change |
|---|---|
| `src/AppRoutes.tsx` | Added the `/demo` route |
| `src/App.tsx` | `/demo` uses the full-width layout (like Coach View) |
| `src/components/speech/VoiceAnswer.tsx` | `onConfirm` now also passes the confirmed words as an optional second argument. Existing callers are unaffected |

# Coach View test results

**Date:** 2026-11-01.

**Build:** production build (`npm run build`), served by `vite preview`. The backend (`server/index.mjs`) has **no API keys**.

**All data is fictional demo data.** These are automated tests: a simulated speaker where speech is involved, and no real coordinators or learners. **Nothing here shows usefulness in the field.**

## 1. Summary

| Check | Result |
|---|---|
| Unit + integration (`npx vitest run`) | **681 / 681** in 32 files (was 634). New: 61 Coach View tests in 4 files (below) |
| Type check (`tsc -p tsconfig.app.json`) and build | OK |
| Browser suites (`npm run test:e2e`, real Chromium) | **10 / 10**, including the new **coach-e2e: 32 / 32 checks**. Primary learner journey **55 / 55** (unchanged) |
| Mocked-Claude suite (`ai-mock-claude.cjs`, mock API on :8899, run separately) | Passed, including the new Coach View "Simpler words" check. **Mock fixtures, not real Claude output** |
| Evaluations: main · consistency · held-out v1 / v2 / v3 / v4 | 102 / 102 · 46 / 46 groups · 21 / 22 · 32 / 34 · 36 / 36 · 19 / 24. **Unchanged:** the learner understanding logic was not touched |
| Horizontal overflow at 360 px (coach home, profile, session; en / hi / te) | None |

**New test files:**

| File | Tests | What it covers |
|---|---|---|
| `src/coaching/__tests__/coaching.test.ts` | 29 | Pure logic: statuses, levels, evidence, follow-up, sessions, overrides, notes, scope, AI guard |
| `src/coach/__tests__/coachUI.test.tsx` | 14 | Screens: home, profile, "Why this lesson?", accept / change, weekly activity, notes, full session, pause / resume, languages |
| `server/coach/wording.test.mjs` | 4 | `/api/coach-wording` with the official SDK and a fake fetch |
| `src/progress/__tests__/progressUI.test.tsx` | 14 | Coach section rewritten for the new UI |
| `tests/e2e/coach-e2e.cjs` | 32 checks | Browser |

## 2. Requirements → evidence

### Section 11 · Coach View testing

| # | Requirement | Result | Where |
|---|---|---|---|
| 1 | Different learners have different progress | ✅ All 6 demo learners have different status / level / topic combinations and **6 different "why" headlines**. A change to one learner does not change another's summary | coaching.test "1 ·"; coachUI "Coach home" |
| 2 | Incorrect assessment answers → relevant coaching | ✅ sales = profit → Sales and profit (R1) with the "₹500 of vegetables" action; mixed money → Two pockets; "not sure" → R2; harder question wrong → R3 at Intermediate; all correct → R5 with no invented difficulty | coaching.test "2 ·" |
| 3 | Weekly challenges update correctly | ✅ Agreed → due after 2 days → coach check-in (`by: coach`) → "done" triggers the understanding check → explained / partly / not yet; partly → smaller; unclear → easier; no time → smaller; agreeing a follow-up clears the barrier. Browser: offline check-in persists | coaching.test "3 ·"; coachUI; coach-e2e |
| 4 | Session completion updates progress | ✅ A session adds a learner session, practice answers (first try marked), a new agreed activity and a note; completion appears in history and persists after reload | coaching.test "4 + 10"; coachUI "runs all five steps"; coach-e2e §3 |
| 5 | Coordinator overrides are saved | ✅ Lesson change (reason required, personal data refused) saved with `ruleId`; level change saved and revertible; accept saved as a snapshot; log shows each | coaching.test "5 + 7"; coachUI; progressUI; progress-e2e (persists after reload) |
| 6 | Hindi, Telugu and English work | ✅ Coach View in en / hi / te; learner-facing session content in her language (Telugu for Saraswathi) and switchable; preview languages shown as "coming soon" and never switch the language | coachUI; progressUI; coach-e2e §5 |
| 7 | Offline behaviour and sync limits are clear | ✅ With the network cut, Coach View reloads from the cache, shows "📴 Offline…", and saves a note and a check-in that survive a reload. Banner: "No server sync in this prototype: data stays on this device." **Sync itself is not built** | coach-e2e §6 |
| 8 | The learner app still works | ✅ Primary journey 55 / 55; all 9 earlier browser suites pass; no Coach View link in the learner app | test:e2e |
| 9 | Recommendations stay within approved content | ✅ Every playbook line (3 languages × 3 businesses × all topics and levels) passes the advice / claim / personal-data guards, has no unfilled placeholders and uses only item-bank amounts. Every recommended lesson and suggested activity is approved | coaching.test "9 ·" |
| 10 | A session can be paused and resumed | ✅ Pause at Practice → profile shows "Resume session · step 4 of 5" → resumes at Practice with no second session. Also after closing the page mid-session (browser reload) | coaching.test; coachUI; coach-e2e §4 |

### "Why this lesson?" testing

| Requirement | Result | Where |
|---|---|---|
| Recommendations match actual diagnostic and practice results | ✅ Saraswathi: the exact diagnostic question and her answer "Yes", then the lesson question where she again counted all sales as profit and got it right on a later try | coaching.test (exact sentences); coachUI; coach-e2e |
| Explanations never invent history | ✅ `evidenceIsGrounded`: every evidence point maps to a stored event of the matching type and outcome (all demo learners). A learner whose practice was right gets "1 of 1 answers right", never "struggled" | coaching.test |
| Different learners get different explanations | ✅ 6 / 6 distinct headlines | coaching.test |
| No assessment history → appropriate explanation | ✅ R0: "No first check yet, so there is no learning history to explain." No diagnostic claims; action = do the first check | coaching.test; coachUI |
| Overrides saved without deleting evidence | ✅ Event log is append-only (the earlier events are byte-identical); the explanation still shows "The app suggested Sales and profit: … Counts all sales money as profit." | coaching.test; progressUI |
| Language switching preserves meaning | ✅ Same evidence count in en / hi / te; same amounts (500, 300, 500); native script; switching the coach language in the UI keeps the same points | coaching.test; coachUI |
| Logic is deterministic | ✅ The same record (deep copy) gives a byte-identical recommendation for every demo learner | coaching.test |
| Limited evidence wording | ✅ Exactly "Recommended based on the initial assessment. More practice is needed to understand this learning need." | coaching.test; coachUI |
| ≤ 3 points by default | ✅ `keyEvidence` ≤ 3; UI list ≤ 3 until "Show all" | coaching.test; coachUI; coach-e2e |

### AI wording (optional)

| Check | Result |
|---|---|
| No key | 503 → "AI wording is not switched on. Showing the approved wording." (browser) |
| What is sent to the model | Only the one sentence (no evidence, misconceptions or IDs). Logs carry metadata only |
| Validator rejects | New amounts, loan advice, a dropped name, the wrong script |
| Browser re-check | Rejects an invalid reply |
| Mocked Claude in the browser | A valid rewrite is shown and labelled "Reworded by AI…"; the evidence list is unchanged |
| Real Claude | **Not tested.** No key was used |

## 3. Bugs found and fixed during testing

| # | Bug | Fix |
|---|---|---|
| 1 | **Practice question changed under the coach's finger.** Recording Meena's correct answer resolved her misconception, so the live recommendation (and the question) switched topics and the feedback disappeared | The session plan (lesson, level, topic) is fixed when the session starts. Regression test added |
| 2 | **"She was not sure" claimed without a "Not sure" answer.** The rules' "unsure" level also covers "lesson started, not finished" | New rule id `R2B_IN_PROGRESS` with accurate wording |
| 3 | **Coach-choice headline lost the app's reason** (looked at the coach's topic instead of the rules' topic) | `rules.misconceptionIds` kept in the object |
| 4 | **Leading space in a translation** broke the review-CSV round-trip | Moved the space into code |
| 5 | **Mobile header took a third of the screen** | Compact header: icon buttons on small screens, sync note moved into the banner |

## 4. What these tests do NOT show

- That coordinators can use the Coach View, understand the evidence sentences, or finish a session in 20 minutes. **No coordinator has used it.**
- That the playbook actions are what coordinators would do, or that they help learners. Desk-written; not reviewed by the NGO.
- That Hindi or Telugu coach text is correct and natural. Drafts, flagged W39–W42.
- That read-aloud works on target phones. Browser engine only; voice availability varies; no real speech heard.
- Anything about sync, multi-device use, sign-in or access control. **None is built.**
- Real Claude behaviour for "Simpler words". Only the mock was used.

## 5. How to re-run

```bash
cd app
npx vitest run                         # unit + integration (681)
npx tsc -p tsconfig.app.json --noEmit
npm run build
npx vite preview --port 4176 --strictPort &   # in one terminal
node server/index.mjs &                       # backend without keys
npm run test:e2e                       # 10 browser suites, incl. coach-e2e
# optional, mocked Claude:
node tests/e2e/mock-anthropic.mjs &
ANTHROPIC_API_KEY=sk-test-fake CLAUDE_API_BASE_URL=http://localhost:8899 node server/index.mjs &
node tests/e2e/ai-mock-claude.cjs
```

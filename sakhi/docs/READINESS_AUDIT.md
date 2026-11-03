# Readiness audit: DIAGNOSE → TEACH → PRACTICE → TRACK

**Date:** 2026-10-30.

**Scope:**
- Every feature was audited against the PRD (P0 list) and the primary product promise.
- The primary journey was fixed so it works end to end.
- This was not a redesign. Bookkeeping stays out of scope.

**Method:**
- Read the code.
- Ran every automated test.
- Ran the built app in a real Chromium against nine browser suites, including a new end-to-end **primary-journey** suite.
- Ran the AI wiring once more against a **mocked** Claude.

**Bottom line:** the primary journey works end to end in a real browser, from a Telugu learner at a vegetable stall through to the coordinator's Coach View. Two parts of that journey were tested only with **simulated** engines:
- **Spoken guidance and voice answers.** No real Hindi or Telugu audio has ever been played or recognised.
- **Claude explanations.** No real Claude call has ever been made, because no key is configured.

Without real speech engines the app shows a clearly labelled fallback, and the journey still completes by tapping. Without a Claude key it uses approved lesson text.

## 1. Feature status

Legend:
- ✅ Fully implemented and tested
- 🟡 Implemented but not tested (in the way that matters, e.g. with real engines)
- 🧪 Simulated or mocked (only exercised with fakes)
- 🟠 Partially implemented
- ❌ Not implemented

| # | Feature | Status | Evidence | Gaps |
|---|---|---|---|---|
| 1 | Language onboarding (en / hi / te) | ✅ | Primary journey: choosing తెలుగు sets `<html lang="te-IN">`; the diagnostic, lesson, feedback, challenge and Home all appear in Telugu. Language switch keeps progress (progress-e2e). The i18n content sweep matches in all 3 languages (eval: 39/39) | PRD P0-4 voice consent and preferred name are **❌ not implemented**. Hindi and Telugu copy is **not native-reviewed** (MULTILINGUAL_REVIEW.md) |
| 2 | Business-specific personalisation | ✅ | Vegetable / tea / grocery variants in the assessment bank and the lesson content. The journey checks that the Telugu question names కూరగాయలు and that the challenge names the mandi. Content tests (63 + 21). Numbers come from the calculation engine (133/133 reference values) | The "other" business type in PRD P0-4 is ❌ |
| 3 | Diagnostic assessment scoring | ✅ | Deterministic engine (`assessment/engine.ts`): 34 engine tests, 63 content tests, eval 95/95. The journey's spoken wrong answer "అవును, ఐదు వందలు లాభమే" was scored `misconception` (revenue counted as profit) | 5 questions per attempt (PRD: 6–8) |
| 4 | Lesson recommendation from real results | ✅ | `recommend()` uses concept levels and misconception codes. Journey part 1: misconception on revenue/profit → `revenue_vs_profit / misconception`. Journey part 2 (Hindi, tea stall): wrong only on customer credit → `customer_credit`. **Not always Module 1** | Recommending modules 2–5 is real, but those lessons don't exist yet (see #5) |
| 5 | Lesson progression | 🟠 | Module 1 (sales vs profit): state machine with 18 machine tests, 6 UI tests and lesson-e2e. Steps: diagnostic result → teach → question → targeted feedback → retry → new practice → check → challenge → completion. Resumes after reload (offline suite) | **Modules 2–5 have no lesson content** (❌). Before: an English "Placeholder" screen. **Now:** an honest, translated "not in the app yet, your coach will teach this" screen with a practice next step (see §3) |
| 6 | Live speech-to-text | 🟡 browser / 🧪 Sarvam | The browser Web Speech path is built (exact `te-IN` / `hi-IN`, never English; the journey checks the requested language). The app never selects or scores an answer by itself. Every voice answer in tests came from a **simulated** recogniser. In real headless or headed Chromium the recogniser never starts, and the app correctly falls back to tap answers (speech-e2e). Sarvam STT is built but **not configured**: no key, and the host was blocked; verified against a mock only | No recognition of real audio, ever. Plan: SPEECH_VALIDATION.md |
| 7 | Live text-to-speech | 🟡 browser / 🧪 Sarvam | Listen buttons call `speechSynthesis` / Sarvam. They are not animations. With a **simulated** speaker the journey checks that the Telugu question and lesson step are sent with a `te-IN` voice, and that "explain simply" re-reads at rate 0.7. With the **real** engines here (0 voices) the app shows "No … voice on this phone. Please read the text, or ask your coach" (journey part 3) | No real audio has been heard. No pre-recorded audio pack exists (PRD P0-10 wants one; `npm run audio:pregen` needs a Sarvam key) |
| 8 | Claude API integration | 🧪 | Server `/api/explain` uses the official SDK with schema output, guards, rate limits and timeouts (43 server tests, 13 guard tests, 16 client tests). Browser suite against a **mocked** Messages API: Telugu and Hindi examples, refusal handling, interpretation. Personal numbers and loan questions are handled on the device and **not sent** (re-run today). Without a key (the real configuration here) the app uses approved fallbacks (ai-nokey) | **No live Claude call has been made.** Model id `claude-haiku-5-5` and output quality are unverified. Nothing in this app is "functional AI" until a live run passes (`npm run eval:llm -- live --confirm`) |
| 9 | Weekly challenges | ✅ | Assigned at the end of the lesson (journey). Shown on Home and in Coach View. Next-session check-in with done / partly / not yet plus difficulty, with an easier follow-up (progress-e2e). A phone number typed in the note is refused | PRD voice reflection (P0-11) is ❌. Challenges exist for module 1 only |
| 10 | Progress persistence | ✅ on device / ❌ across devices | `LocalProgressRepository` (typed profiles and event log in localStorage). The journey reloads and still shows Telugu and the challenge. The offline suite resumes the lesson after a reload | PRD P0-12 "across devices after sync": **no server and no sync** |
| 11 | Per-learner data isolation | ✅ on device | Every store is keyed by learner id: `hisaab.progress.v1.<id>`, `hisaab.lesson.v1.<id>.<lesson>`, `hisaab.assessment.v1.<id>`. New `isolation.test.ts`: changing DL-01 leaves the other 4 profiles byte-identical; DL-02 has no lesson or assessment state. Journey: DL-02's roster entry is unchanged after DL-01's session | No sign-in, no PIN, no encryption. Anyone holding the phone can open any learner (prototype banner says so) |
| 12 | Coach View | ✅ with limits | Roster, learner detail, concept levels, misconception flags, assessment summary, challenges and check-ins, rule-based talking points, override of the next lesson with a required reason, lesson review, "start session with …" (progress-e2e, 11 UI tests). The journey checks that after DL-01's session the coach sees lesson 1 completed, the Telugu language, the diagnostic misconception, the challenge, and a "practising" (not mastered) level | PRD P0-2 facilitator sign-in and **creating learner profiles** are ❌. The roster is 5 fictional learners. It only sees learners on **the same device** (no sync). The guided 20–25 min session timer (P0-15) is 🟠 (start session and check-in exist; no timer or "short on time" path) |
| 13 | Offline behaviour | 🟠 | **New today:** a service worker caches the app shell (27 files incl. all fonts). The offline suite cuts the network, cold-reloads, and completes language, business, diagnostic, recommendation and lesson feedback, then resumes after a reload. Voice answers are replaced by a clear notice and tap answers remain. AI falls back to approved text | Speech and AI need the network. There is no content or audio pack download (P1-5) and no sync when the connection returns (P0-16) |

### Previously reported placeholders: current verdict

| Report | Verdict | Evidence |
|---|---|---|
| "Microphone input simulated a correct response" | **Not true of the app today.** `VoiceAnswer` uses the real recogniser and shows the words for confirmation; nothing is auto-selected. **But the voice tests themselves use a simulated microphone**, and no real speech has been recognised | Code search finds no auto-answer path. The journey checks that a matched option needs confirmation. Real-engine runs show the fallback |
| "Diagnostic results always recommended Module 1" | **Fixed / not reproducible** | Journey part 2 → `customer_credit`. Eval cases recommend `savings_cash_management` etc. |
| "Only Module 1 was fully developed" | **Still true** | Modules 2–5 have assessment items, recommendations and Coach View support, but **no lessons**. They are now labelled honestly instead of showing a placeholder |
| "Coach View learners shared the same progress" | **Fixed / not reproducible** | Per-learner keys; `isolation.test.ts`; journey isolation check |
| "Listen buttons displayed animations without actual audio" | **Not true in code; unverified on real devices** | Listen calls the speech engine. Without a voice the app shows a "no voice" notice instead of a fake animation (journey part 3). Real audio output has not been heard in any environment we have |

## 2. Primary journey: verified step by step

Suite: `app/tests/e2e/primary-journey.cjs`, run against the production build. **37/37 checks pass.** Microphone and speaker are **simulated** in part 1 and **real** (absent) in part 3.

| Step | Result |
|---|---|
| Selects Telugu | UI and `<html lang>` switch to te-IN |
| Chooses vegetable stall | The diagnostic names కూరగాయలు, ₹500 |
| Hears the question | Simulated speaker receives the Telugu text with a te-IN voice. With real engines here: "no voice" notice |
| Answers incorrectly by voice: "అవును, ఐదు వందలు లాభమే" | Simulated recogniser in te-IN. Matched "అవును" → **shown for confirmation**, then scored `misconception` |
| Misconception identified, lesson recommended | `revenue_vs_profit`, reason `misconception` |
| Interactive lesson | Opens by naming her result (sales counted as profit). Steps read aloud in Telugu (simulated). Voice answer "రెండు వందలు" → ₹200 → positive feedback |
| Asks "మళ్ళీ చెప్పండి, అర్థం కాలేదు" mid-practice | Treated as a clarification request: question re-read, nothing selectable, not scored |
| New practice question, answered with the hidden-costs mistake | Corrective feedback with the right numbers: other costs ₹80, profit ₹270 (₹800 − ₹450 − ₹50 − ₹30) |
| Retry | Positive feedback. Check question correct |
| Weekly challenge | Vegetable-specific (mandi). Accepted |
| Completion | **"developing", not "understood"**: practice needed a retry, and the documented rule requires first-try practice for "understood" |
| Saved to her profile | Survives a reload; Home shows the challenge |
| Next module (2) | Home marks it "with your coach" and offers module 1 practice instead of a dead end |
| Coordinator opens Coach View | DL-01: lesson 1 completed; Telugu; diagnostic misconception; challenge; level "practising" with the reason "on the right track, not yet first-try correct"; DL-02 unchanged |

## 3. Issues fixed in this audit

| Issue | Why it mattered | Fix | Test |
|---|---|---|---|
| A recommendation for modules 2–5 led to an **English "Placeholder"** screen; Home's main button "Start today's lesson" led there too | Broke the diagnose → teach promise for most results, and the experience was misleading | Translated "This lesson is not in the app yet. Your coach will go through this topic with you…" with listen, practice and home buttons. Recommendation and Home show a "With your coach" note; Home's primary action becomes "Practise sales and profit" | `notReady.test.tsx` (5); journey part 2; Home check in the journey |
| The practice screen labelled **every** wrong number as "you took all the sales money" (misconception `SALES_AS_PROFIT`) and recorded it as that misconception | Inaccurate corrective feedback and false misconception flags in Coach View | Only the number that a misconception produces gets that label. Any other wrong number gets general guidance and is recorded as `incorrect` (a miss, with no misconception code) | `lib/__tests__/calc.test.ts` (4) |
| Coach View described a "developing" lesson result as "needs more practice", while the learner was told "you're on the right track" | Coach and learner saw contradictory messages | New reason `lessonDeveloping`: "on the right track, not yet first-try correct" (en/hi/te) | `engine.test.ts` (expectation updated from `lessonNeedsReview` to `lessonDeveloping` for a developing result; a needs-review result keeps the old reason) |
| **No offline start:** with no network the app could not even open (no service worker) | PRD principle "works in a village" | `public/sw.js` + build-time precache manifest. Network-first, cache fallback; `/api` never cached; production builds only | `tests/e2e/offline.cjs` (7) |
| The AI browser suite still expected personal-data and loan questions to reach the AI layer, but the intent layer now stops them on the device | Stale test, not an app bug | Expectations updated: they are handled on the device and not sent | `tests/e2e/ai-mock-claude.cjs` |
| Browser suites lived only in a scratch folder | Not reproducible by the team | Moved into `app/tests/e2e/`, with `npm run test:e2e` | 9 suites |
| (New) per-learner isolation had no unit test | Earlier regression risk | `progress/__tests__/isolation.test.ts` | 2 |

**Not changed:** curriculum, items, correct answers, scoring rules and lesson text.

## 4. Differentiation check

| Claim | Holds? | Evidence |
|---|---|---|
| Not an unrestricted chatbot | **Yes** | No free-text chat anywhere. The AI is only used inside the lesson to word explanations from an approved pack. Its output passes guards for schema, script, numbers, advice and personal data. Advice and personal data never leave the device. Assessment screens have no AI at all |
| Uses real assessment results for personalisation | **Yes** | Recommendation, lesson opening ("your answers showed…") and Coach View all read the stored result (journey parts 1–2) |
| Appropriate corrective feedback | **Yes for module 1; fixed today on the practice screen** | Misconception-specific feedback with recomputed numbers. Arbitrary wrong numbers are no longer misdiagnosed |
| Distinguishes clarification from answers | **Yes, on text transcripts** | 58 + 91 intent tests; eval 95/95; consistency 245/245 (development scores); held-out v2 23/34 untuned. Not measured on real audio |
| Tracks learning across sessions | **Yes on one device** | Reload, resume, check-in next session, "last active", session count. No cross-device sync |
| Supports facilitator-guided learning | **Partly** | Coach View with talking points, override with reason, lesson review, "start session with her", check-ins. Missing: facilitator sign-in, creating learners, session timer and "short on time" path |

## 5. Simulated or mocked functionality (do not present as working AI or voice)

- **Speech recognition and speech output in every automated test.** These use fake `SpeechRecognition` / `speechSynthesis` objects in jsdom tests and in the Playwright suites (primary-journey part 1, intent, multilingual, speech-e2e simulated mode).
- **Sarvam STT and TTS.** Verified against a local mock upstream only. Not configured.
- **Claude explanations.** Verified against `tests/e2e/mock-anthropic.mjs` (fixture replies) only. The real configuration here has no key, so learners get approved fallback text.
- **Learner roster.** 5 fictional demo learners seeded on first run. No real learner creation.
- **Illustrations.** Placeholder artwork (flat SVG), pending commissioned regional art.
- **Hindi and Telugu wording, and the recognised phrases.** Developer-written drafts, not native-reviewed.

## 6. Actual test results (this run, 2026-10-30)

| Suite | Result |
|---|---|
| Unit + integration (`npm test`, Vitest) | **594 / 594 passed**, 27 files |
| Type checks (app + evals) | Clean |
| Production build | OK |
| Browser suites (`npm run test:e2e`, real Chromium, production build, backend without keys) | **9 / 9 suites passed:** primary-journey (37 checks), offline (7), lesson, speech, progress/coach, intent, multilingual, fallback, ai-nokey |
| Mocked-Claude browser suite (`ai-mock-claude.cjs`, fixture upstream) | Passed. Wiring and guards only, **not** AI quality |
| Eval: main set | 95 / 95, 0 critical |
| Eval: language consistency | 245 / 245 (development score) |
| Eval: held-out v1 / v2 | 21 / 22, 32 / 34 (both seen). Untuned v2: 23 / 34 |
| Live Claude, LLM judge, real audio, native review | **Not run** (no key, audio or reviewers) |

## 7. Remaining blockers

**Blocking a field pilot (not the classroom demo):**
1. **Real speech has never been tested.** Run the SPEECH_VALIDATION.md plan on 2+ Android phones with Hindi and Telugu speakers, including noise and spoken amounts.
2. **No live Claude run.** Run `npm run eval:llm -- live --confirm` with a key, and confirm the model id and the guards on real output. Until then, describe AI explanations as "optional, falls back to approved text".
3. **Native-speaker review** of all Hindi and Telugu copy and recognised phrases (27 wording flags, 9 high priority).
4. **Facilitator sign-in, learner creation, consent capture and a server with sync** (PRD P0-2, P0-3, P0-4, P0-12, P0-16). Without these, real learners cannot be enrolled, and the coach only sees learners on the same phone. DPDP-compliant consent and deletion are also needed (PRD R8).

**Not blocking the primary demo, but required by the PRD:**
- Modules 2–5 lessons (P0-6).
- Pre-recorded audio packs (P0-10).
- Session timer and "short on time" path (P0-15).
- Voice reflection on challenges (P0-11).
- "Other" business type.

## 8. Steps needed before Prompt 10

1. **Freeze the primary journey as the regression bar.** `npm test`, `npm run test:e2e` and `npm run eval` must stay green on every change.
2. **Get credentials and run the pending live checks:**
   - a Claude key → live explanations and LLM judge
   - a Sarvam key with 0-day retention → `npm run eval:sarvam`, `npm run audio:pregen`
3. **Run the real-device speech test** (SPEECH_VALIDATION.md sheet) and record results per language, engine and noise condition.
4. **Book native reviewers** (≥2 per language) and resolve the 9 high-priority wording flags.
5. **Decide the data model for real learners:** facilitator sign-in, learner creation with voice consent, and a sync server. This is the largest missing P0 area. Scope it before adding modules.
6. **Then** author Module 2 (Everyday costs) as the next lesson, because it is the most common next recommendation after Module 1 in the demo data.

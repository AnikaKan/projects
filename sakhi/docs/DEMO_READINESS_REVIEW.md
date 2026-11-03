# Demo-readiness review

**Date:** 2026-11-01.

**Reviewer:** product team with an AI assistant, working as a senior product reviewer. The review walked through all 23 learner screens in English and Telugu at 375 px width, using the production build.

**Status:** final refinements are implemented and all tests pass (§6). The app is **ready for a classroom demo**. It is **not** yet validated with learners: every judgement below about what a learner "can understand" is a **design assumption** until moderated testing happens (§4).

Screenshots:
- `docs/img/demo-before-en.png`: before this round
- `docs/img/demo-after-en.png`: after this round
- `docs/img/demo-after-en-te.png`: English and Telugu
- `docs/img/ux-before-en.png`: the app before the low-literacy redesign

## 1. Audit against the ten questions

Ratings:
- ✅ good enough for the demo
- ⚠️ works, with a known weakness
- ❌ blocker

| # | Question | Rating | Finding | Action this round |
|---|---|---|---|---|
| 1 | If she cannot read well, can she still understand what to do? | ⚠️ | **Question screens work without reading:** each one is read aloud, each choice can be heard again, and pictures plus the mic carry the task. **Lesson explanation screens and NEXT / coach cards still rely on 2–4 sentences.** They have a large Listen button, but the meaning is in the text | Lesson rule given a picture equation (§2). Text length left as is: it is approved curriculum (UX_REDESIGN_NOTES §4) |
| 2 | Is the primary action obvious on every screen? | ✅ | Every screen has **one full-width terracotta footer button**. Where there is a second button it is an outline ("Continue" under "Try again", "Not now" under "I'll do this"). Disabled "Check answer" is visibly pale until a choice is made | None needed |
| 3 | Too many words anywhere? | ⚠️ | Heaviest screens: lesson intro and example (curriculum text); the applied practice scenario ("Second scenario", four numbers); the Today NEXT card ("Your coach will go through this topic with you in your next session."); lesson-complete, which repeats the weekly task in full | None in content this round. Listed in §3 for the curriculum team |
| 4 | Are buttons large enough? | ✅ | Choices ≥ 72 px tall plus a 64 px 🔊 per choice; footer buttons 60 px; tabs 76 px; mic 88 px. No horizontal overflow at 360 px in en / hi / te (checked earlier this week) | None needed |
| 5 | Is the microphone central enough? | ✅ | 88 px round mic with "Tap and speak", directly under Listen and above the choices, on every question and practice screen. "Or tap your answer" makes tapping an equal alternative | None needed |
| 6 | Are visual cues strong enough? | ⚠️ → ✅ | **Defect found:** Yes / No choices used ✅ / ❌. On the first diagnostic question the correct answer is **No**, so a green tick on **Yes** suggested "this is right" and nudged the wrong answer. That makes it a measurement problem, not only a cosmetic one. **Defect found:** the lesson's rule strip showed "Sales − ₹ … = Your profit". The "₹ …" chip looked like a rendering bug | Yes / No → neutral **👍 / 👎** (unit test added). Rule strip → **🧺 Sales − 📦 Costs = 💰 Your profit** in en / hi / te |
| 7 | Is the distinction between sections clear and minimal? | ✅ | Two tabs, each with a picture and a word: ☀️ Today (what to do now) and 🌱 My learning (all topics and how she is doing). Today has NOW and NEXT labels. Coach View is not reachable from learner screens (press and hold the ₹ logo, or open `#/coach`) | None needed |
| 8 | Are Bengali, Assamese and Tamil shown correctly as preview languages? | ✅ | বাংলা · অসমীয়া · தமிழ் render in bundled fonts (offline too) on dashed "Coming soon" cards. Tapping one opens a sheet with the greeting and an honest "no voice on this phone" notice if needed. The app language never changes (unit and browser tested). On a 375 px screen the Tamil row sits just below the fold, so the list needs a small scroll | None. A scroll is acceptable |
| 9 | Are question prompts and choices read aloud? | ✅ (simulated) | Listen reads the question, then each choice in turn, highlighting the choice being read. Each choice has its own 🔊. Each new question is read automatically after her first tap. **Verified only with a simulated speaker** (browser tests check the order and the highlight), never heard on a real phone | None needed. Real-phone check is in §4 |
| 10 | Does the app feel more intuitive than before? | ⚠️ (judgement) | Compared with `ux-before-en.png`: one action per screen instead of six; 2 tabs instead of 4 tabs + a coach icon; Listen and mic first instead of text first; a picture on every choice. **This is the team's judgement, not a measurement.** No learner has used either version | — |

### Header title (found while auditing, fixed)
Long lesson titles were cut off in the header, e.g. "Sales and pro…". The title now wraps onto up to 2 lines. In Telugu, "అమ్మకాలు, లాభం" fits on one line.

## 2. Refinements made this round

| Area | Before | After | Why |
|---|---|---|---|
| Yes / No cues | ✅ Yes · ❌ No | 👍 Yes · 👎 No | A tick and a cross mean "correct / wrong" and gave away (or contradicted) the answer on diagnostic and lesson questions. Cues must describe the choice, not judge it |
| Lesson rule strip | Sales − **₹ …** = Your profit | 🧺 Sales − 📦 Costs = 💰 Your profit | Readable without words. Uses the same pictures as the practice strip (🧺 − 📦 = 💰), so she sees one consistent picture of the rule |
| Header title | Cut off with "…" | Wraps onto up to 2 lines | A learner should not be expected to guess the end of a word |
| New label | — | "Costs / खर्च / ఖర్చులు" (`bar.costs`) | Hindi and Telugu are developer drafts. Add them to native review (W39 in `wording-review.csv` when the review sheet is next updated) |

**Unchanged:** curriculum text, correct answers, scoring, calculations, recommendations, the speech pipeline and Coach View.

## 3. Biggest improvements (across the low-literacy and learning-model rounds)

1. **Voice first on every question.**
   - Listen reads the question and then each choice, with a highlight.
   - Each choice has its own replay.
   - Auto-read starts after her first tap.
   - The 88 px mic sits above the choices.
2. **One action per screen,** always in the same place (the footer).
3. **Two tabs** (☀️ Today · 🌱 My learning) instead of four tabs plus a coach icon. Coach View is hidden from learners.
4. **Pictures on every choice, topic, level and section.** The yes/no cues are now neutral, so they never hint at the answer.
5. **A shorter, adaptive diagnostic.**
   - 5 easy questions.
   - Only learners who pass the gate get up to 3 harder ones.
   - Every screen recommends the same lesson.
6. **Practice goes easy → harder,** with a picture sum (🧺 − 📦 − 🥀 = 💰 ?) that the engine fills in. The AI never calculates.
7. **A warm, high-contrast palette with larger type.** Rose, not red, is used for "try again".
8. **Honest states.**
   - "With coach" and "not in the app yet" instead of padlocks and dead ends.
   - "Coming soon" previews for বাংলা · অসমীয়া · தமிழ்.

## 4. Remaining weaknesses

### Usability
| # | Weakness | Impact | Suggested next step |
|---|---|---|---|
| U1 | **Lesson intro, example and applied-practice screens are text-heavy** | A non-reader depends fully on audio there | Cut each to ≤ 2 short sentences plus a picture with the curriculum team. Text changes go through native review |
| U2 | **NEXT / "with your coach" cards are sentence-based** | Hard to scan | Replace with a 👩‍🏫 picture + topic name + 🔊 |
| U3 | **The recommendation screen has a second button, "Answer new questions"** | A learner may tap it instead of "Start this lesson" and retake the diagnostic | Consider moving the retake into My learning |
| U4 | **Lesson-complete repeats the weekly task in full** after the challenge screen | Extra text at the end of a long session | Show "🚩 Saved" + 🔊 only |
| U5 | **Auto-read cannot start before the first tap** (a browser rule) | The very first question waits for "Listen" | Facilitator tip: "tap 🔊 Listen first" |
| U6 | **Emoji depend on the phone's emoji font** (🪙, 🧰 may be boxes on old Android) | A missing picture; the word is still there | Check on NGO phones; commission pictograms later |

### Evidence gaps (unchanged, stated plainly)
- **No learner, coordinator or native-speaker testing has happened.** Every usability claim in this document is a design judgement.
- **No real voice has been heard.** Speech recognition and read-aloud are tested only with a simulated microphone and speaker. Recognition accuracy in Hindi and Telugu is unknown (SPEECH_VALIDATION.md; a 43-prompt real-audio sheet is ready).
- **The Hindi and Telugu interface text is unreviewed** (W01–W38, plus the new "Costs" label).
- **Only lesson 1 exists.** Topics 2–3 are "With coach"; topics 4–5 are "Later".
- **Coach View has no PIN.** The press-and-hold gesture hides it but does not protect it.

## 5. What is real vs mocked

| Part | Status in the demo | Say it like this |
|---|---|---|
| Diagnostic, scoring, tiers, recommendations | **Real:** deterministic code, fully tested | "Rules, not AI, decide her level and next lesson" |
| Lesson 1 and practice, feedback, hints | **Real:** fixed approved content; the calculation engine computes every number | "All numbers come from code. The AI never does sums" |
| Progress, levels, weekly tasks, check-in | **Real:** stored on the phone only (localStorage) | "Nothing leaves the phone" |
| Coach View | **Real screen, fictional data:** demo learners Lakshmi, Sunita and Farzana are invented | "These are made-up learners" |
| Read-aloud and tap-to-speak | **Real browser engines** (Web Speech API). Whether a voice exists depends on the phone and browser. **Never tested with real speech** | "It uses the phone's own voice. We have not yet tested it with real speakers" |
| Sarvam speech (better Indian-language recognition) | **Not configured.** Code exists, tested against a mocked server only | "Planned; not switched on" |
| "Explain another way" (Claude) | **No API key in the demo.** The button shows a pre-approved fallback explanation. Code tested against a mock Claude server only | "Today this shows a prepared explanation. The AI version is built but not switched on" |
| Offline | **Real:** the service worker caches the app (browser test: 7 checks) | — |
| বাংলা · অসমীয়া · தமிழ் | **Preview only:** name and greeting, no interface or lessons | "Coming soon" |

## 6. Verification (2026-11-01, after the refinements)

| Check | Result |
|---|---|
| Unit + integration (`npx vitest run`) | **634 / 634** (new: `components/__tests__/choiceVisuals.test.tsx`, which checks yes / no never use ✅ / ❌) |
| Type check (`tsc -p tsconfig.app.json`) and build | OK |
| Browser suites (`npm run test:e2e`, real Chromium) | **9 / 9.** Primary journey **55 checks**; offline 7 checks |
| Evaluations | Main **102 / 102**; consistency **46 / 46 groups** in every language (all categories 100%). Unchanged, because the understanding logic was not touched |
| Visual review | 23 screens re-captured in English and Telugu after the changes |

## 7. Recommended demo flow (≈ 7 minutes)

**Setup**
1. Use a phone, or Chrome device mode at 375 px, with the production build (`npm run build && npx vite preview`).
2. Before the class, open `#/coach`, tap **Reset demo data**, then reload `#/` so onboarding starts fresh.
3. Turn the volume up, and check once that the phone speaks English and Hindi or Telugu.
4. Keep the Telugu tour screenshots ready as a backup if speech fails.

| Time | Step | What to show | What to say |
|---|---|---|---|
| 0:00 | **Language** | Tap 🔊 on English / తెలుగు; tap **தமிழ்** to show the "Coming soon" preview, then go back | "She chooses by sound. Three languages work today; three more are previews" |
| 0:45 | **Business** | Pick 🥬 Vegetables | "Examples use her own business" |
| 1:00 | **Diagnostic Q1** | Tap **🔊 Listen**: the question, then each choice is read with a highlight. Point at 👍 / 👎 | "No marks, no reading needed. The pictures describe the choice; they don't give away the answer" |
| 1:45 | **Answer by voice** | Tap the mic and say "Yes" (the wrong answer). Show the confirmation and the gentle 💡 feedback. Answer the other 4 by tapping | "A spoken answer is always confirmed. Mistakes get a calm explanation, not red" |
| 3:00 | **Recommendation** | "🌱 Starting with the basics" → **Start this lesson** | "Rules pick the lesson from her answers, the same way every time" |
| 3:30 | **Lesson 1** | Rule strip 🧺 − 📦 = 💰; one question; tap **Explain another way** | "This is a prepared explanation today. The AI version is built but not switched on" |
| 4:30 | **Practice** | 🎯 Practise → easy question with the picture sum; one wrong tap → hint → right | "Easy first, then harder. Every number is computed by code" |
| 5:30 | **Today / My learning** | NOW and NEXT; topics with ✅ / 👩‍🏫 / 🔒 | "Two places only: what to do now, and how I'm doing" |
| 6:15 | **Coach View** | Press and hold the ₹ logo → Lakshmi's level, misconception, next lesson | "Hidden from learners. Fictional data. Not yet PIN-protected" |
| 6:45 | **Close** | The real-vs-mocked table (§5) and the next steps | "Next: test with 5–8 women per language, native review, and real-voice testing" |

**If something fails live**

| Problem | What to do |
|---|---|
| No voice | Say "this phone has no Telugu voice; the app says so", and show the notice |
| Mic blocked | Tap the answers. Tapping is a full alternative |
| App lost its state | Coach View → Reset demo data |

## 8. Next steps (in order)
1. A moderated usability test with 5–8 women per language, on NGO phones. Tasks: answer by voice, hear choice 2 again, find "what to practise", change the language.
2. Real-audio recognition test (43-prompt sheet).
3. Native review of W01–W39.
4. Shorten the lesson explanation screens (U1) and replace the NEXT card text with pictures (U2).
5. Add a coach PIN.

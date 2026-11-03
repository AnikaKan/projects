# Information architecture simplification

> **Update 2026-11-01 (learning-model round):** simplified again to **two learner tabs: ☀️ Today · 🌱 My learning.**
> - **Lessons tab removed.** It listed the same five topics as My Journey; every topic now appears once, in My learning.
> - **"My Journey" renamed "My learning".**
> - **Today** shows only NOW (one action: continue / start the lesson, or today's practice), NEXT (what comes after), this week's task, and "done so far".
> - **My learning** lists each topic once, in MVP order, with one status (✅ Done · ▶ Now · ▶ Start · 👩‍🏫 With coach · 🔒 Later), its level, and 🎯 practise / 🔁 review where practice exists.
> - `/lessons`, `/practice` and `/progress` all redirect to My learning.
>
> See MVP_LESSON_PRIORITIZATION.md and DIAGNOSTIC_STRATEGY.md. Sections below describe the intermediate 3-tab step and remain for history.

**Date:** 2026-11-01. **Status:** implemented and tested in the app (`src/AppRoutes.tsx`, `src/components/ScreenShell.tsx`, `src/screens/Journey.tsx`). This document replaces the tab structure described in USER_FLOW.md and DESIGN_DECISIONS.md.

## 1. Audit of the previous structure

**Learner header** (every screen):
- ₹ logo
- title
- 🌐 language
- 👤 Coach

**Bottom tabs:**

| Home | My Lessons | My Practice | Progress |
|---|---|---|---|

| Problem | Evidence (before screenshots: `docs/img/ux-before-en.png`) |
|---|---|
| **"My Practice" and "Progress" overlapped.** Both listed the five topics, both showed "Needs more practice", and both had a button that led back into lessons. The difference ("do something" vs "see how I'm doing") was abstract and was carried only by words | Practice: 4 cards, 3 of them locked ("Later", "After the lesson"). Progress: the same 5 topics with levels and "needs practice" again |
| **Four tabs plus a coach icon = five destinations** in the learner's view. Learners with little smartphone experience depend on a few stable places | Bottom bar plus 👤 in the header |
| **Coach View one tap away from learners.** The 👤 icon sat in the learner header on every screen. It opens a dense, English-first, text-only coach screen with other women's data | Header icon on every learner screen |
| **Locked items everywhere.** "Later" / "After the lesson" cards and locks on Lessons and Practice signalled "you can't" more often than "you can" | Lessons: 4 of 5 locked; Practice: 3 of 4 locked |
| **Labels were abstract:** "Progress", "Learning Progress", "Introduced", "Practising", "Shown understanding", "Quick review · 2 questions · 2 min" | — |
| **Several equal-weight actions per screen.** Home had a plan button, a challenge, a "more practice" link, a module card, a journey row and a footer button | Home before |

## 2. New structure

```
Learner (3 tabs, picture + word)                      Facilitator (hidden from learners)
┌──────────┬──────────┬──────────────┐                 press-and-hold the ₹ logo (≈1 s) or open #/coach
│ 🏠 Home  │ 📖 Lessons│ 🌱 My Journey │                 → Coach View (unchanged, separate visual mode)
└──────────┴──────────┴──────────────┘
Home        → today's lesson (or "continue"), this week's task, one "Listen to today's plan"
Lessons     → the 5 topics as picture cards, one status each: ✅ Done · ▶ Now · 👩‍🏫 With coach
My Journey  → how I am doing · 🎯 practise now · my 5 topics as a growth path 🌱🌿🌳 · my weekly tasks
```

**Decision: "My Practice" and "Progress" are merged into "My Journey".**

Reasons:
1. **Same content.** Both screens were organised around the same five topics and the same "needs practice" signal. Two tabs for one list doubled what she had to remember.
2. **Practice follows from progress.** "This topic needs more practice" and the button to practise it now sit side by side. Before, the flag was on one tab and the action on another.
3. **Little practice content exists today.** There is one practice set (Sales and profit) plus a review that unlocks after the lesson. A whole tab for two items, mostly locked, was mostly empty promises.
4. **Fewer, more stable places.** Three tabs fit icon + label at a large size on a 360 px phone.

When more practice sets exist (modules 2–5), the "🎯 Practice" section in My Journey grows. Split it into its own tab only if field testing shows learners look for practice separately.

**Routes:**
- `/journey` is new.
- `/practice` and `/progress` redirect to `/journey`, so old links and the coach's "open with her" flows keep working.
- `/practice/m1` and `/practice/review` (the practice questions) are unchanged.

**Removed:**
- The "My Practice" list screen and the "Progress" screen. Their content now lives in My Journey.
- The coach icon in the learner header.
- The journey dot row and the "more practice" link on Home (both now in My Journey).
- Mastery badges on Lessons (the level now lives only in My Journey: one job per screen).
- Locked padlocks for modules 2–5 on Lessons. These are now "👩‍🏫 With coach", which opens the honest "not in the app yet, your coach will teach this" screen.

**Kept unchanged:**
- Onboarding → diagnostic → recommendation → lesson flow.
- Lesson state machine, scoring, feedback, weekly challenge, check-in.
- Coach View content.

## 3. One main action per screen

| Screen | The one main action (footer) | Everything else |
|---|---|---|
| Language | Continue | Language cards with 🔊 greeting; 3 "coming soon" previews |
| Business | Continue | 3 picture cards |
| Diagnostic question | Confirm answer | 🔊 Listen (question + choices), 🎤 speak, picture choices |
| Recommendation | Start this lesson | — |
| Home | ▶ Start today's lesson / ▶ Continue / 🎯 Practise (if today's topic has no lesson yet) | 🔊 Today's plan |
| Lessons | (tap a card) | — |
| Lesson step | Continue / Check answer | 🔊, Explain another way |
| My Journey | 🎯 Practice now (▶ Start lesson before the first lesson) | 🔊 Hear how I am doing |
| Practice question | Check answer | 🔊 Listen, 🎤 speak, ⌨ type a number |

## 4. Coach access

- Coach View is not linked from any learner screen. A facilitator opens it by **pressing and holding the ₹ logo for about 1 second**, or by going to `#/coach` (e.g. a bookmark on the NGO phone).
- A normal tap on the logo goes Home, so an accidental tap never surprises the learner.
- This is **not access control**: anyone who knows the gesture can open it. The PRD's facilitator sign-in / PIN (P0-2) is still not implemented (see READINESS_AUDIT.md).

## 5. Languages in the selector

| Language | Status |
|---|---|
| English · हिन्दी · తెలుగు | Full interface, lessons, speech |
| বাংলা · অসমীয়া · தமிழ் | **Preview only:** marked "Coming soon". Tapping shows the greeting, a "Hear hello" button if the phone has a voice for that language, and "Choose another language". The app language never changes. No interface, lessons, recognition or scoring exist for them. Fonts are bundled (bold weight only) so the names render offline |

## 6. Verified

- `tests/e2e/primary-journey.cjs` (47 checks, real Chromium) covers:
  - exactly 3 learner tabs, and no coach link in the header
  - `#/progress` redirects to My Journey
  - My Journey shows the level and enabled practice + review after the lesson
  - press-and-hold opens Coach View
  - the full Telugu diagnose → teach → practise → track journey
- Unit tests:
  - `progressUI.test.tsx`: My Journey levels survive a language switch.
  - `voiceUI.test.tsx`: preview languages never change the app language.

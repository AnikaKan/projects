# User Flow & Information Architecture — Clickable Wireframes

**Status:** Draft v0.1 · **Last updated:** 2026-10-28 · **Companion to:** `PRD.md`, `ARCHITECTURE.md`, `DESIGN_DECISIONS.md`

This document describes the flows that the clickable wireframes (`/app`) implement. All content is fictional. Hindi and Telugu copy is **draft** and needs native-speaker review (PRD §7, step 8).

---

## 1. Information architecture

```
Learner app (one learner profile at a time; on the coordinator's or her own phone)
│
├── Onboarding (first run only)
│   ├── 1. Language            #/onboarding/language
│   ├── 2. Business            #/onboarding/business
│   ├── 3. Diagnostic          #/assessment          3–5 questions, resume / start again
│   └── 3b. Recommendation     #/assessment/result   starting lesson + concept levels (see ASSESSMENT.md)
│
├── Primary navigation (bottom bar, always visible after onboarding)
│   ├── Home                   #/home            today's session, current challenge
│   ├── My Lessons             #/lessons         5 modules in order
│   │   └── Lesson player      #/lessons/:id     listen → see → reflect
│   │       └── Practice       #/practice/:id    question → feedback → retry
│   │           └── Completion #/lessons/:id/complete   weekly challenge
│   ├── My Practice            #/practice        practice sets and spaced review
│   └── Learning Progress      #/progress        path, mastery, challenge history
│
├── Language switcher (sheet; reachable from the top bar on every screen)
│
└── Coach View (separate area, PIN-gated in production; open in the prototype)
    ├── Roster                 #/coach
    └── Learner detail         #/coach/learner/:id → [Start session] → learner Home

Presentation
└── Wireframe gallery          #/wireframes   all screens side by side, each one clickable
```

**Rules**
- The bottom bar has 4 items and is hidden during onboarding, the lesson player, and practice, so the learner stays focused on the task.
- The language can be changed on every screen. Changing it never resets progress, the current step, or answers already given.
- Coach View is reached only from the top-bar "Coach" link (a long-press + PIN in production). Learners never see the roster.

---

## 2. Primary flow — first coaching visit (facilitator-assisted, about 22 min)

```
Language ──▶ Business ──▶ Diagnostic (5 Qs) ──▶ Recommendation ──▶ Lesson / Home
                                                               │
                         ┌─────────── "Start today's lesson" ◀──┘
                         ▼
                 Lesson: 1 Listen ──▶ 2 See the money ──▶ 3 Think about it
                                                               │
                                                               ▼
                                     Practice question ──▶ Feedback
                                         ▲                  │ wrong: specific hint
                                         └──── Try again ◀──┤
                                                            │ right
                                                            ▼
                                      Lesson complete + Weekly challenge
                                                            │ "I'll do this"
                                                            ▼
                                                  Home (challenge pinned)
                                                            │
                                                            ▼
                                                Learning Progress (path updated)
```

| # | Screen | Purpose | One primary action | Voice | Tap / text alternative |
|---|---|---|---|---|---|
| 1 | Language | Pick a language using its native name | **Continue** | Each option plays a greeting | Tap a language card |
| 2 | Business | Personalize scenarios | **Continue** | Prompt narrated | Tap a picture card |
| 3 | Diagnostic | Find where to start; framed as "let's see where to start", not a test | **Next** | Mic to say the answer | Tap an amount card |
| 4 | Home | Today's session plus the current challenge | **Start today's lesson** | "Listen to today's plan" | — |
| 5 | Lesson | Teach one concept with her business | **Next** | Narration on every step; mic for reflection | Reflection chips |
| 6 | Practice & feedback | Check understanding; targeted hint | **Check answer** → **Continue** | Mic answer + "Did you say ₹500?" confirmation | Tap amount, or type a number |
| 7 | Completion & challenge | Close the lesson, commit to an action this week | **I'll do this** | Challenge narrated | — |
| 8 | Progress | Show the path, mastery, and past challenges without grades | **Continue learning** | "Hear my progress" | — |
| 9 | Coach View | Prepare and run sessions | **Start session** | — (coach-facing, text-first) | — |

## 3. Secondary flows

**Returning visit (week 2):** Home → challenge check-in card ("Did you try it? Yes / Partly / Not yet") → next lesson. *(Check-in answer stored locally in the prototype.)*

**Switch language mid-lesson:** top-bar globe → sheet with English / हिन्दी / తెలుగు → the screen re-renders in place. The step number, selected answers, completed lessons, and challenge are all kept.

**Coach prepares a visit:** Coach roster (sorted by "visit due") → learner detail (gaps, flagged misconceptions, talking points) → **Start session** → learner Home in the learner's own language.

**Short on time:** On the lesson screen, "Short on time?" skips to the weekly challenge (PRD P0-15). *(Placeholder link in the prototype.)*

**Voice fails or offline:** The mic shows "Didn't catch that — tap your answer". Tap options are always on screen, so voice is never required.

## 4. Error and edge states represented
- Wrong answer → misconception-specific hint, then retry (shown in the Practice screen).
- Two wrong answers → worked example plus "Your coach will go over this with you" (shown).
- Offline banner component (toggle in the gallery to preview it).

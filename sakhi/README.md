# Sakhi (formerly Hisaab Saathi) — Clickable wireframes

React + TypeScript + Tailwind prototype of the learner app and Coach View.
No live AI or speech APIs: audio playback and voice input are simulated.

## Run
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run preview    # serve the build
```

## Routes (hash routing)
| Screen | Route |
|---|---|
| Language selection | `#/onboarding/language` |
| Business selection | `#/onboarding/business` |
| Diagnostic | `#/assessment` (`?q=1` jumps to question 1) |
| Home | `#/home` |
| My Lessons / Lesson player | `#/lessons`, `#/lessons/m1` |
| My Practice / Practice & feedback | `#/practice`, `#/practice/m1` (`?demo=hint` shows the hint state) |
| Lesson complete + weekly challenge | `#/lessons/m1/complete` |
| Learning Progress | `#/progress` |
| Coach View | `#/coach`, `#/coach/learner/:id` |
| **Presentation gallery** | `#/wireframes` (all screens side by side, live; Visual/Wireframe toggle, language, demo state, offline) |

`VITE_GALLERY_ONLY=1 npm run build` builds a gallery-only bundle (used for the shareable page).

## Structure
- `src/lib/calc.ts` — deterministic calculation engine slice (all amounts come from here)
- `src/i18n/strings.ts` — en-IN / hi-IN / te-IN strings (Hindi & Telugu are draft, need native review)
- `src/state/AppState.tsx` — demo state (language change never resets progress)
- `src/screens/*` — learner screens · `src/coach/*` — Coach View · `src/presentation/Gallery.tsx`
- Fonts (Noto Sans, Devanagari, Telugu) are bundled locally for offline rendering.

## Speech (browser + Sarvam AI)
- Browser speech works with no setup. Sarvam AI (Saaras STT, Bulbul TTS) is used when the backend has a key.
- `cp .env.example .env` and set `SARVAM_API_KEY` (backend only — never `VITE_`), then `npm run server` + `npm run dev`.
- Dev-only Voice Lab: `#/dev/voices` (dev server, or build with `VITE_ENABLE_VOICE_LAB=1`).
- `npm run audio:pregen -- --dry-run`, `npm run eval:sarvam`, `npm run i18n:export|import` — see docs/SARVAM.md and docs/SPEECH.md.

# UI proportion refinement

**Date:** 2026-11-01.

**Scope:** proportions and spacing only. No changes to flows, content, scoring, voice behaviour or data.

**Screenshots** (phone width 375 px, full screens):
- `docs/img/ui-before-after.png`: recommendation, lesson question, lesson complete, Today, My Learning and Business, before and after
- `docs/img/ui-after-onboarding.png`: the benchmark onboarding screens after the change

**Not yet tested with learners.** "Calmer" and "more polished" are design judgements. "Still accessible" is checked by measured target sizes.

## 1. Audit: what felt off

The onboarding screens (language, business, "Let's see where to start", first question) were the benchmark. On those screens:
- there is one heading of about 26 px
- body text is about 20 px
- choices are full-width cards
- there is one primary button

The later screens used the same parts but **larger and heavier**, and each screen had its own sizes.

| Screen | Problem |
|---|---|
| **Header (all inner screens)** | The title at 22 px wrapped onto two lines ("Sales and / profit"), and the logo, back and language buttons were 48 px. The header was taller on lesson screens than on onboarding, so the top of each screen jumped |
| **Recommendation** | Full-width stall illustration + title + reason + Listen inside one card, then a 5-row list with 48 px rows, then two footer buttons. The card alone filled most of the screen; the recommendation itself got lost |
| **Lesson explanation and example** | Body paragraphs at 22.5 px bold-ish line length made short texts look like long text blocks. Example bars were 48 px tall |
| **Question screens (lesson, practice, diagnostic)** | 56 px Listen bar + 88 px mic with an 8 px halo inside a 3-line card + 72 px choices with 56 px picture tiles. The answer area stacked to about 560 px, and choices were pushed below the fold |
| **Feedback cards** | 30 px emoji + 22.5 px semibold text: louder than the question they answer |
| **Weekly challenge** | Full-width illustration + 22.5 px semibold text in a tall card |
| **Lesson complete** | 56 px icon, 22.5 px body, 22.5 px bold rule card: three competing "loud" blocks |
| **Today** | The lesson card had a full-width illustration; "now" and "practice" cards had 64 px icons and 27 px titles; challenge text at 20 px. Today scrolled about two screens |
| **My Learning** | 56 px icons, 22.5 px titles, 18 px status chips that wrapped, thick 2 px rings on every card, 28 px chevrons |
| **Business** | 128 px mic with an 8 px halo, a 34 px heading over three lines, 132 px tool cards, 60 px keypad keys, 48 px amount display |
| **Bottom nav** | 76 px tall; "Business Helper" wrapped onto two lines |

## 2. The unified sizing system (now)

The root font size is 18 px (`html { font-size: 112.5% }`, unchanged), so `text-base` is 18 px.

| Token | Value | Used for |
|---|---|---|
| Screen heading | **26 px** bold | Onboarding, recommendation, lesson steps, completion, Today greeting, Business welcome |
| Question text | **22.5 px** semibold (`text-xl`) | Unchanged from the diagnostic benchmark: questions are the one thing that stays big |
| Body text | **20 px** (`text-lg`) | Explanations, feedback |
| Secondary text | **18 px** (`text-base`) | Lists, cards, notes |
| Small text | **15–16 px** (`text-sm`) | Chips, captions |
| Primary button | **56 px** (was 60), 20 px bold, pill | Continue, Start, Check answer, Practise now, Business confirm |
| Secondary button | **48 px** (was 52), 18 px, outlined pill | — |
| Listen button | **48 px** (was 56) pill, 32 px icon disc | Slow button 48 px (was 56) |
| Microphone (answer panels) | **72 px** (was 88), 4 px halo (was 8), "Tap and speak" 22.5 px (was 27) | Card 1 px ring (was 2), tighter padding |
| Microphone (Business home) | **96 px** (was 128) | The single main action on that screen |
| Answer choice | **64 px** min (was 72), 20 px text, 48 px picture tile (was 56) | Per-choice 🔊 column 56 px wide (was 64) |
| Cards | `rounded-2xl` (was a mix of 2xl / 3xl), 16 px padding, 1 px ring for neutral cards | 2 px rings kept for selected / important states only |
| Icons in rows | 48 px tiles (lists), 56 px (Today NOW card) | Emoji 24–30 px |
| Header | Title 20 px (one line for most titles), logo 40 px, language pill 44 px | Back button stays 48 px |
| Bottom nav | **64 px** (was 76), 15 px labels, icon pill 32 × 56 | — |

**Large illustrations** are kept only where they *are* the content: the starting-point screen and the "Let's see where to start" intro. Elsewhere they became a **96 px thumbnail** beside the title (recommendation, Today) or a **60%-width banner** (weekly challenge).

## 3. Screen-by-screen changes

| Screen | Change |
|---|---|
| Recommendation | Illustration → thumbnail beside "Your lesson now · Sales and profit"; level chip 18 px; list rows 8 px padding. Full screen height 1,391 → 1,148 px (−17%) |
| Lesson intro / example / starting point | Body 22.5 → 20 px; headings unified at 26 px; example bars 48 → 40 px |
| Lesson question / practice / diagnostic | Smaller Listen, mic and choice components (above). Full screen height: lesson question 1,115 → 999 px (−10%), practice 1,072 → 976 px, first diagnostic question 940 → 852 px. On a 375 × 812 phone the last choice of a 4-choice lesson question still needs a short scroll |
| Feedback | Emoji 30 → 24 px; message 22.5 → 20 px; closing line 18 px |
| Weekly challenge | Banner illustration at 60% width; activity text 20 px |
| Lesson complete | Icon 48 px; body 20 px; rule card 20 px bold |
| Today | Greeting 26 px on one line; NOW cards are one row (thumbnail or icon + title + subtitle); NEXT / challenge text 18 px; the "done so far" link 52 px. Screen height 1,382 → 1,176 px (−15%) |
| My Learning | Topic rows: 48 px icon, 20 px title, 15 px chips, 1 px ring, 22 px chevron; section headings 22.5 px |
| Practice | Picture sum strip lighter (1 px rings, smaller emoji); feedback sizes as above |
| Check-in | Barrier buttons 64 px (was 72) |
| Business | Welcome 26 px (two lines); 96 px mic; tool cards 112 px with 36 px emoji; question = 56 px picture tile + 22.5 px text in one row (was a 60 px emoji above a 27 px line); amount display 40 px; keypad 52 px; Back / Start again 48 px. Home height 1,290 → 1,068 px (−17%) |
| Coach View, presentation demo | Brand text only. Their layouts are separate and already proportioned for desktop |

## 4. How low-literacy accessibility was preserved

| Accessibility need | Still met |
|---|---|
| Large touch targets | Every interactive control is ≥ 44 px (most ≥ 48; choices 64; primary 56). Browser-checked: Business mic 108 px including halo, Listen 50 px, language pill 44 px |
| Obvious Listen / Speak | Listen stays a full-width marigold pill on every question. The mic stays the largest round control on screen (72 px), next to large "Tap and speak" text |
| Pictures carry meaning | All pictograms kept. Only their size changed (56 → 48 px tiles), still well above icon-recognition sizes |
| Readable text | Questions unchanged at 22.5 px. Body text 20 px, which is the onboarding benchmark. Nothing learner-facing is below 15 px (chips and captions) |
| One primary action | Unchanged. Footers keep one strong button; secondary actions are outlined |
| Calm, warm look | Same palette; fewer 2 px rings and halos, so selected and important items stand out more than before |

**No wording was changed** in this round, except the brand and tab names. Shortening lesson texts is still a curriculum and native-review task (see DEMO_READINESS_REVIEW.md, U1).

## 5. Onboarding (benchmark) screens

These were changed only through the shared components:
- Listen 56 → 48 px
- mic 88 → 72 px
- choices 72 → 64 px
- primary button 60 → 56 px
- header title 22 → 20 px

Layout, headings and illustrations are unchanged (see `ui-after-onboarding.png`).

## 6. Verification (2026-11-01)

| Check | Result |
|---|---|
| Unit + integration (`npx vitest run`) | **707 / 707** in 35 files (new `branding.test.ts`) |
| Type check + production build | OK |
| Browser suites (`npm run test:e2e`, real Chromium) | **12 / 12**: primary journey 55 / 55 · offline 7 / 7 · lesson · speech · progress / coach · intent · multilingual · fallback · AI no-key · Coach View 32 / 32 · presentation demo 22 / 22 · Business 27 / 27 (+4 brand / size checks) |
| No horizontal overflow at 360 px | Learner screens, Coach View and Business, in en / hi / te (existing suite checks) |
| Visual review | 25 learner screens re-captured before and after (see `ui-before-after.png`); heights above are measured full-screen captures at 375 px wide |

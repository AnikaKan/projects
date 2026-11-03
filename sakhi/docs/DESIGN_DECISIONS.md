# Design Decisions — Voice-first, Low-literacy UI

**Status:** Draft v0.1 · **Last updated:** 2026-10-28

Each decision lists the choice, why we made it, and what to validate in field testing.

## 1. Interaction model

| # | Decision | Rationale | Validate |
|---|---|---|---|
| D1 | **Structured "cards and steps", not a chat thread.** Each screen is one step with one question. There are no message bubbles and no text input box as the main affordance. | The PRD forbids open chat. Chat layouts suggest "type anything" and favour literate users. Steps give a sense of progress and keep a 20-minute session on track. | Do learners understand where they are in a lesson? |
| D2 | **One primary action per screen**, as a full-width 56px button pinned to the bottom (thumb zone). Secondary actions are text links or outline buttons. | Reduces choices and helps when a coach and learner share one phone. | Tap errors, hesitation time |
| D3 | **Audio and mic are the most visible controls.** Every screen has a "Listen" pill in a fixed spot (top of the content). Answer screens add a 72px mic button. | Learners who do not read rely on audio. A consistent location builds habit. | Do learners find replay without prompting? |
| D4 | **Voice is never the only path.** Every voice prompt has tap options. Numeric answers also allow typing a number. | Noisy stalls, poor connectivity, STT accuracy risk (PRD A3). | Which input do learners choose? |
| D5 | **Voice answers are confirmed** ("Did you say ₹500?") before scoring. | Guards against STT errors counting as wrong answers (ARCH §3, guardrail 4). | Confirmation fatigue |
| D6 | **Feedback names the specific mistake** ("You counted all the money from sales. Remember to take out what you paid for stock.") instead of "Wrong". | Respectful, teaches, and matches the misconception engine. | Tone with adult learners |

## 2. Visual language

| # | Decision | Rationale |
|---|---|---|
| V1 | **Warm, grown-up palette:** deep teal (brand, trust), marigold (attention, warmth), clay (gentle correction, never alarm red), leaf green (success), off-white paper background. | Feels like a modern Indian product, not a children's app or a bank. All text pairs meet WCAG AA, and primary text is ≥ 7:1 on paper. |
| V2 | **Flat, geometric illustrations of real stalls** (vegetable cart with awning, tea stall with kettle, kirana shelves) drawn as inline SVG. No mascots, faces with exaggerated features, stars, or confetti. | Familiar and respectful. Learners recognise their own business. Inline SVG is light and works offline. |
| V3 | **Money shown as quantities, not just digits.** Amount chips use a ₹ note motif. The "money bar" splits sales into *paid for stock*, *spoiled*, and *left for you*. | Builds number sense visually. Supports learners who read numbers but not words. |
| V4 | **Progress shown as a path with 4 plain states** (Not started · Learning · Practising · Confident) using icon + colour + label. No percentages, scores, or grades. | Avoids school-test anxiety (PRD R5). Colour is never the only signal. |
| V5 | **Typography:** Noto Sans family for Latin, Devanagari, and Telugu. Base 18px, headings 24–28px, line-height 1.5 (1.7 for Telugu). No fixed-height text containers. Buttons grow with text. | Telugu and Devanagari have tall ascenders and descenders and conjuncts that clip in tight boxes. Telugu strings are often 30–40% longer. |
| V6 | **Tap targets ≥ 48px, primary ≥ 56px, mic 72px**, with 12px minimum spacing between targets. | Exceeds WCAG 2.5.5. Accounts for hands that are busy or wet at a stall. |

## 3. Language

| # | Decision | Rationale |
|---|---|---|
| L1 | **Languages labelled in their own script** (English · हिन्दी · తెలుగు), each with a play button that says the greeting aloud. | Learners recognise their script or hear their language. They should not need to read English to choose. |
| L2 | **Language switcher available on every screen** (globe in the top bar). It changes language in place and keeps progress. | Families and coaches may switch language. Progress is keyed to language-neutral IDs (ARCH §4.2). |
| L3 | **Digits in Western Arabic numerals, Indian grouping** (₹1,20,000) in all languages. | Matches price tags and phone keypads. Native digits stay a future setting (PRD A5). |
| L4 | **Plain everyday words with an approved loanword list** (e.g. "profit/मुनाफ़ा/లాభం"). | Matches how learners talk. |

## 4. Coach View

| # | Decision | Rationale |
|---|---|---|
| C1 | **Separate area with its own visual mode** (denser, text-first, list and detail; two columns on tablet and desktop). | Coaches are literate and time-poor, and need to scan 15–20 learners quickly. A distinct look prevents confusion with learner mode. |
| C2 | **"Talking points" written as questions to ask**, not scores to report. | Supports a coaching conversation instead of an audit. |
| C3 | **Entry hidden behind a small "Coach" link** (long-press + PIN in production). | Shared-device privacy (PRD R1). |

## 5. Presentation mode
- `#/wireframes` shows every screen in 375px phone frames, each one clickable.
- A **Wireframe / Visual** toggle switches the frames to greyscale with annotations (purpose, primary action, voice/tap alternatives) for design reviews.
- A **language selector** in the gallery switches all frames at once to show script handling side by side.

## 6. Known gaps (to resolve before hi-fi)
- Illustrations are simplified placeholders. Commission an illustrator with regional references.
- Hindi and Telugu copy is draft and needs native review and field testing.
- Audio is simulated (no recordings yet). Voice recognition is simulated with a fixed recognised answer.

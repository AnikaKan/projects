# Architecture — AI Financial Learning Companion

**Status:** Draft v0.1 · **Last updated:** 2026-10-28 · **Companion to:** `docs/PRD.md`

---

## 1. Architectural goals

1. **Offline-first.** The whole learning session runs on the device. The network is used for sync and optional AI.
2. **Deterministic core, bounded AI.** Curriculum flow, scoring, calculations, and progress are pure, testable code. Generative AI sits behind one narrow interface, never decides correctness alone, and never produces numbers.
3. **Content as data.** Lessons, scenarios, feedback, and challenges are versioned JSON content packs plus audio. Adding a language or business type requires no new code.
4. **Shared-device safe.** Multiple learner profiles on one facilitator phone, with clear separation.
5. **Low-end device budget.** 2 GB RAM Android, slow 3G or no connection, limited storage.

---

## 2. System overview

```
┌──────────────────────────── Device (PWA) ─────────────────────────────┐
│  UI layer (React)                                                     │
│   Learner screens · Facilitator screens · Lesson player · Audio UI    │
│        │                                                              │
│  ┌─────▼──────────── DETERMINISTIC CORE (pure TS) ────────────────┐   │
│  │ ContentRepository   SessionStateMachine   LessonStateMachine   │   │
│  │ CalcEngine          AnswerScorer          MisconceptionRules   │   │
│  │ MasteryModel        DiagnosticScorer      ChallengeAssigner    │   │
│  │ ReviewScheduler     TalkingPointRules     Formatter (₹, i18n)  │   │
│  └─────┬─────────────────────────────────────────────┬────────────┘   │
│        │ events                                       │ AIRequest     │
│  ┌─────▼──────────────┐                    ┌──────────▼─────────────┐ │
│  │ Local store         │                    │ AI Adapter (client)    │ │
│  │ IndexedDB (Dexie)   │                    │ • online check         │ │
│  │ • event log/outbox  │                    │ • timeout → fallback   │ │
│  │ • projections       │                    │ • output validator     │ │
│  │ • content packs     │                    └──────────┬─────────────┘ │
│  │ Cache Storage: audio│                               │               │
│  └─────┬──────────────┘                               │               │
│  Service Worker (app shell, pack caching, background sync)            │
└────────┼───────────────────────────────────────────────┼──────────────┘
         │ HTTPS (sync)                                   │ HTTPS (AI)
┌────────▼───────────────────────────────────────────────▼──────────────┐
│ Backend                                                               │
│  Auth (facilitator) · Sync API (append-only events) · Projections DB  │
│  Content CDN (versioned packs + audio) · AI Gateway                   │
│                                          ├─ STT provider (hi/te/en-IN)│
│                                          └─ LLM provider (classify/   │
│                                             constrained rephrase)     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Deterministic vs generative split

This is the central design rule.

| Concern | Deterministic (code + content) | Generative AI (optional) | Fallback when AI unavailable |
|---|---|---|---|
| Curriculum sequence and session flow | ✅ State machines | ❌ | — |
| Lesson text and narration | ✅ Pre-authored per locale and pre-recorded | ❌ at runtime (P2: offline authoring aid, human-reviewed) | — |
| Scenario numbers | ✅ `CalcEngine` generates and verifies | ❌ | — |
| Answer correctness | ✅ `AnswerScorer` compares to the engine's result | ⚠️ AI only **maps speech to a candidate option or number**. The scorer decides correctness. | Tap answer |
| Misconception detection | ✅ Rule table: wrong value → misconception code | ❌ | — |
| Feedback content | ✅ Pre-authored per misconception × locale; shown first, always | ⚠️ Claude may add a *supplementary*, personalised re-explanation on request ("Explain another way"), built only from approved content and validated amounts. See `AI_EXPLANATIONS.md`. | Next approved variant, or the approved rule |
| Speech to text | ❌ | ✅ STT | Tap input; voice button disabled |
| Spoken answer → option/number | ✅ Locale synonym lists and number-word parser decide the option | ⚠️ If nothing matches, Claude may reply with a short clarification/explanation/redirect. It never selects or scores an option. | Approved "please choose one of the answers" + tap |
| Reflection theme (P1) | ❌ | ✅ Classify into a fixed theme enum | Facilitator picks a theme manually |
| Mastery and progress | ✅ `MasteryModel` rules | ❌ | — |
| Challenge selection | ✅ `ChallengeAssigner` rules | ❌ | — |
| Facilitator talking points | ✅ `TalkingPointRules` | ⚠️ P1: rephrase into one sentence from structured input only | Rule-based bullets |

### AI guardrails
> Implemented for Claude explanations in `app/server/explain/` and `app/shared/aiGuards.mjs`; full detail in `AI_EXPLANATIONS.md`.

1. **Closed input and output.** Every AI call is one of a few named *tasks* (`MAP_ANSWER`, `CLASSIFY_REFLECTION`, `REPHRASE_BRIEF`). Each has a fixed prompt template, an enumerated output schema, and a max token count. There is no free-form user-to-LLM channel.
2. **Schema validation.** Output is parsed against a Zod schema. Invalid output → fallback.
3. **Number firewall.** Any digit or number-word in AI output must match a value supplied in the request. Otherwise it is rejected.
4. **Confidence gating.** `MAP_ANSWER` returns `{optionId | value, confidence}`. Below the threshold (initially 0.75), the app asks for confirmation ("Did you mean ₹400?") or falls back to tapping.
5. **Mastery cap.** Answers mapped by AI can raise mastery to *Practicing* at most. Reaching *Confident* requires at least one tap-confirmed or facilitator-confirmed answer.
6. **No PII to providers.** Requests contain audio or transcript and option labels only: no names, village, or learner ID. Providers are configured with no data retention where available.
7. **Logging.** Each AI call logs its task, latency, confidence, and outcome (accepted/fallback) for evaluation. It does not log raw audio by default.

---

## 4. Deterministic core modules

All modules are pure TypeScript with no I/O and are 100% unit-testable.

### 4.1 CalcEngine
- Integer money (whole rupees for display; paise internally where division happens). No floating point for money.
- Functions: `revenue(sales[])`, `totalExpenses(items[])`, `profit(rev, exp)`, `spoilageCost(qty, unitCost)`, `creditOutstanding(entries[])`, `savingsProjection(dailyAmount, days)`, `householdLeakage(withdrawals[])`.
- **Scenario generation:** a scenario template declares variables with constraints, for example `{stockCost: 600..1000 step 50, sellMarkup: 1.3..1.6}`. The engine draws values with a seeded PRNG (seed = learnerId + lessonId + attempt, so results are reproducible), computes the derived values, and checks the constraints (for example, profit must be positive and a "round-ish" number).
- **Distractor generation:** wrong options are calculated from known misconceptions (for example, `revenue` offered as "profit", or `profit` ignoring spoilage). This links each wrong answer to a misconception code.

### 4.2 Content model (simplified)
```ts
Concept      = 'REVENUE' | 'PROFIT' | 'EXPENSES' | 'CREDIT' | 'SAVINGS' | 'SEPARATION'
Module       { id, concepts: Concept[], lessons: LessonId[] }
Lesson       { id, moduleId, steps: Step[], variants: Record<BusinessType, VariantRef> }
Step         = Narration | ScenarioVisual | Reflection | Practice | Feedback | WorkedExample
Practice     { id, concept, templateId, answerType: 'option'|'number', options?: OptionSpec[] }
OptionSpec   { id, kind: 'correct' | 'distractor', misconception?: MisconceptionCode, image }
Challenge    { id, concept, businessTypes, difficulty, audioKey }
LocalePack   { locale, version, strings: Record<Key,string>, audio: Record<Key,AudioRef>, glossary, synonyms }
```
Content is **language-neutral in structure**. Locale packs only provide strings and audio for keys.

### 4.3 State machines (XState or a hand-rolled reducer)
- **SessionStateMachine:** `checkIn → challengeReview → lesson → practice → newChallenge → wrapUp`, with a `shortOnTime` transition that skips to `newChallenge`.
- **LessonStateMachine:** step-by-step. On `practice.wrong` → `hint` → `retry`. After a second wrong answer → `workedExample` and `flagConcept`.

### 4.4 Scoring and mastery
- `DiagnosticScorer`: each concept has ≥1 item, and the key concepts have 2. Output per concept is `{ level: 0..3, misconceptions[] }`. The starting module is the lowest-mastery concept in curriculum order.
- `MasteryModel` (per concept): `NotStarted → Learning → Practicing → Confident`.
  - Learning → Practicing: 2 correct answers in a row, on different scenarios.
  - Practicing → Confident: correct on a spaced review ≥7 days later, plus a cap rule (§3.5).
  - Regression: 2 consecutive misses on review → back to Learning.
- `ReviewScheduler`: deterministic intervals of 1, 2, and 4 visits.

### 4.5 ChallengeAssigner
A rule table: (concept just studied, mastery level, business type, last challenge outcome) → challenge ID. It never repeats the same challenge twice in a row. If the last challenge was "not done", it offers an easier version of the same one.

### 4.6 TalkingPointRules
A rule table that turns learner state into 2–3 talking-point template keys, for example `misconception=COUNTS_REVENUE_AS_PROFIT` → "Ask her what was left in the box after paying the mandi."

---

## 5. Data and sync

> Prototype implementation (2026-10-28): typed learner profiles with an append-only event log, a `ProgressRepository` abstraction over localStorage, fictional demo learners and reset. See `PROGRESS.md`, including the role-based access control and consent requirements for production.

### 5.1 Event-sourced, local-first
- Every meaningful action is an **immutable event**: `LearnerCreated`, `ConsentRecorded`, `DiagnosticAnswered`, `PracticeAnswered`, `ConceptFlagged`, `ChallengeAssigned`, `ChallengeCheckedIn`, `SessionCompleted`, `NoteAdded`.
- Events carry: `eventId (ULID)`, `learnerId`, `deviceId`, `facilitatorId`, `ts`, `payload`, `schemaVersion`.
- **Projections** (current mastery, roster, challenge status) are derived on the device and on the server by the same shared TypeScript reducer.
- **Sync:** an outbox in IndexedDB, pushed in batches; the server returns events from other devices since a cursor. Merging = union of events ordered by `(ts, eventId)` → recompute projections. There are no update conflicts because nothing is updated in place.

### 5.2 Data minimization (schema-level)
- **Stored:** learner first name or nickname, optional photo (stays on device, not synced in MVP), business type, language, village (dropdown), consent record, learning events.
- **Never stored:** bank or account details, Aadhaar/ID, income, actual sales, debts, phone numbers. In "Try with your numbers" (P1), values exist only in memory and are excluded from events by type.
- On-device encryption at rest: the learner DB is encrypted with a key derived from the facilitator credential (WebCrypto). Learner data is wiped on facilitator sign-out (with a warning if events are unsynced).

### 5.3 Backend
- **Prototype:** a managed Postgres BaaS (for example Supabase) or a small Node/Fastify service. Tables: `facilitators`, `learners`, `events`, `content_versions`. Row-level security limits each facilitator to their own learners.
- **Content CDN:** content packs are versioned (`content/{locale}/{version}/…`). The device downloads a manifest and fetches only changed files.
- **AI Gateway:** a server function that holds provider keys, enforces task allow-listing, rate limits, prompt templates, schema validation, and logging.

---

## 6. Voice pipeline

```
[Mic button] → record (WebAudio/MediaRecorder, max 8 s, Opus)
   → if offline: disable mic, show tap options
   → POST /ai/stt {locale, audio}         (STT: Indic-capable provider)
   → transcript
   → Deterministic matcher first:
        - number-word parser per locale ("aath sau", "enimidi vandalu" → 800)
        - synonym list per option
   → if no match: AI MAP_ANSWER {transcript, options[labels], expectsNumber}
   → validate + confidence gate → AnswerScorer (deterministic)
```
- **Output audio:** pre-recorded clips per key (Opus, ~24 kbps mono). Clips are concatenated with number clips for dynamic amounts ("₹" + "eight hundred"), so dynamic sentences need no TTS. TTS is used only for names, if at all.
- **STT provider choice** is an open decision, to be benchmarked in the field (A3). Candidates: Indic-specialized providers (for example Sarvam AI, or Bhashini, the Government of India language platform) vs. general cloud STT. The pipeline is designed so the provider can be swapped behind `/ai/stt`.

---

## 7. Client technology

| Layer | Choice | Rationale |
|---|---|---|
| App type | **PWA** (Vite + React 18 + TypeScript) | No app-store friction, small, easy updates, works on facilitator phones. Can be wrapped later (Capacitor/TWA). |
| State | XState (flows) + Zustand (UI) | Explicit, testable session logic |
| Storage | IndexedDB via Dexie; Cache Storage for audio | Large offline capacity |
| Offline | Workbox service worker | Precaching the shell, runtime caching for packs |
| i18n | `@formatjs/intl` (ICU) + `Intl.NumberFormat('en-IN')` | Plurals, gender, Indian grouping |
| Fonts | Bundled Noto Sans, Noto Sans Devanagari, Noto Sans Telugu (subset) | Offline rendering |
| Validation | Zod | Content packs, AI output, events |
| Testing | Vitest (core), Playwright (E2E, offline mode), content linter | AC enforcement |

**Performance budgets:** app shell ≤3 MB, first interactive ≤4 s on a reference low-end device, ≤40 MB per language pack (all 5 modules with audio).

---

## 8. Proposed repository layout (for implementation)

```
/apps/web            React PWA (screens, components, service worker)
/packages/core       Deterministic core: calc, scoring, mastery, state machines, rules
/packages/content    Content schemas, linter, build script → packs
/packages/ai-client  AI adapter: tasks, fallbacks, validators (no provider code)
/services/api        Sync API + AI Gateway (provider integrations)
/content/{locale}    Authored strings, scenario templates, audio
/docs                PRD.md, ARCHITECTURE.md
```
`packages/core` has **no dependency** on `ai-client`. The UI layer coordinates them. This makes the AI boundary visible in the import graph and lets a lint rule enforce it.

---

## 9. Security and privacy summary
- Facilitator authentication: email/phone OTP online on first use, then a device-bound session with a local PIN.
- Learner mode cannot reach the roster without a long-press plus the facilitator PIN.
- TLS for all traffic. Data encrypted at rest on the device. Server row-level security.
- AI requests contain no personal data. Raw audio is not retained by default.
- Data deletion per learner on request (a tombstone event plus server purge). Aligns with India's DPDP Act principles (consent, minimization, deletion), to be confirmed by NGO legal review.

---

## 10. Key architectural tradeoffs

| Decision | Chosen | Alternative | Why / what we give up |
|---|---|---|---|
| Platform | **PWA** | Native Android / React Native | Faster to build and polish, no store, easy updates. Gives up: native offline STT, more reliable background sync, and some iOS/old-WebView limits. Mitigation: Capacitor wrapper later. |
| Audio | **Pre-recorded narration** | Runtime TTS | Warmer, works offline, consistent pronunciation of local terms. Gives up: flexibility. Every content change needs a new recording, which costs time across 3 locales. |
| Voice input | **Cloud STT, online only; tap always available** | On-device STT | Indic on-device STT quality on low-end phones is unproven, and the models are large. Gives up: voice input offline. |
| AI role | **Re-explain approved content and respond to unclear answers; never compute, score or sequence** (updated 2026-10-28) | LLM-generated lessons and feedback | Safety, accuracy, consistency across languages, testability. Claude output is optional, guarded (schema, amounts, arithmetic, script, topics) and always has an approved fallback. Gives up: open conversation. |
| Personalization | **Pre-authored variants × engine-generated numbers** | AI-generated scenarios | Every scenario is reviewed and correct. Gives up: business types beyond the 3 authored ones (an "other" type gets generic variants). |
| Data model | **Event-sourced, append-only** | CRUD with last-write-wins | Conflict-free offline merges across shared devices, plus a full audit trail. Gives up: some complexity (projection code, schema versioning). |
| Device model | **Facilitator-owned device, multi-profile** | Learner's own device | Matches reality (limited independent access). Gives up: practice between visits (P2). |
| Mastery | **Transparent rules** | Statistical model (BKT/IRT) | Explainable to facilitators, no training data needed. Gives up: precision. Revisit with pilot data. |

---

## 11. Open decisions (need input before or during implementation)
1. STT provider shortlist and field benchmark plan (A3).
2. Backend: Supabase vs. a custom Node service (depends on the NGO's hosting and data-residency preference; India-region hosting recommended).
3. Whether learner photos are allowed at all (consent and community norms) or only avatars.
4. Voice-talent sourcing per locale and recording budget.
5. Facilitator authentication method that fits NGO operations (OTP vs. NGO-issued credentials).

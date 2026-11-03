# PRD — AI Financial Learning Companion ("Sakhi")

**Status:** Draft v0.1 · **Owner:** Product · **Last updated:** 2026-10-28
**Scope:** Polished MVP prototype for facilitator-assisted pilots. Not a production launch.

> Name note (updated 2026-11-01): the product is now called **Sakhi** (formerly the working name "Hisaab Saathi"). See BRAND_UPDATE_SAKHI.md. The Hindi / Telugu spellings and how the name is understood must still be tested with learners in all three languages.

---

## 1. Product vision and value proposition

### Vision
Every woman who runs a small shop can answer three questions with confidence: *Did I make money this week? Where did it go? What will I do differently next week?*

### Problem
Financial literacy programs usually teach definitions, such as "profit is revenue minus expenses." Learners rarely connect these to the decisions they actually make: how much tomato stock to buy, whether to give a regular customer credit (*udhaar*), or whether to take cash from the shop drawer for school fees. Coaching visits are short (20–25 min), connectivity is unreliable, and many learners do not have their own smartphone.

### Value proposition

| For | Value |
|---|---|
| **Entrepreneur** | Learn money concepts through her own kind of business, in her language, mostly by listening and speaking. Every week ends with one small, practical action she can take at her stall. |
| **Field coordinator** | A structured 20-minute session the app runs with her, plus a clear view of each learner's gaps and progress. Less time preparing, better coaching conversations. |
| **NGO program team** | Comparable learning data across cohorts without collecting sensitive financial information. |

### Product principles

1. **Her business, her words.** Every scenario uses her business type, familiar items, and realistic local prices.
2. **Listen first, read rarely.** Voice and pictures carry the meaning. On-screen text only supports them.
3. **Respectful, not childish.** Adult tone, real-life stakes, no cartoons-as-reward, no baby talk.
4. **Structured, not open chat.** The app follows a curriculum. The AI helps understand and personalize; it does not lead.
5. **Numbers are never guessed.** All arithmetic comes from deterministic code.
6. **Works in a village.** Offline-first. Online only makes things better.
7. **The facilitator is part of the product.** Design for two people around one phone.

### Non-goals (MVP)
General chatbot · bookkeeping/transaction logging · loans or banking product recommendations · collecting bank, account, Aadhaar, or income data · fully independent self-study (supported later, not optimized now).

---

## 2. User personas

### Primary: Lakshmi — vegetable stall, Telugu (te-IN)
- 38, runs a roadside vegetable stall near Warangal, Telangana. Studied until class 4. Reads numbers well, reads Telugu slowly.
- Uses her husband's Android phone in the evening, mostly for WhatsApp voice notes and YouTube.
- Buys stock daily at the mandi with cash. Throws away 10–15% of leafy vegetables. Counts the drawer at night but does not know whether she made a profit.
- **Needs:** understand spoilage as an expense; learn when buying cheaper in bulk actually pays off.
- **Fears:** looking foolish in front of the coordinator; family seeing her "mistakes".

### Primary: Sunita — tea stall, Hindi (hi-IN)
- 29, tea and snacks stall near a bus stand in Sitapur, Uttar Pradesh. Studied until class 8. Has her own entry-level smartphone with a prepaid data pack that often runs out.
- Takes household money from the cash box daily. Gives credit to regular drivers.
- **Needs:** separate household and business money ("two pockets"); manage customer credit.
- **Motivation:** wants to save for a second stove and a bigger counter.

### Primary: Farzana — grocery (kirana) shop, Hindi/English mix
- 45, small kirana shop in a peri-urban area near Hyderabad. Comfortable with numbers. Speaks Hindi/Dakhini at home, uses some English words for business ("profit", "stock").
- Large unpaid credit book with neighbours. Revenue looks fine, but cash is always short.
- **Needs:** understand why revenue ≠ profit ≠ cash in hand; build a habit of credit limits and saving.

### Secondary: Priya — field coordinator
- 26, graduate, speaks Telugu, Hindi, and English. Coaches 15–20 entrepreneurs a week across several villages on a two-wheeler. Uses an NGO-provided mid-range Android phone.
- **Needs:** a session she can run with almost no preparation, a two-minute snapshot of each learner before each visit, offline operation in the field, data that syncs back at the office.
- **Pain:** paper notes, inconsistent session quality, no visibility into what learners remember between visits.

### Tertiary: Program manager (NGO)
- Wants cohort-level progress and challenge completion. Uses aggregated reporting only (P2).

---

## 3. Prioritized MVP requirements

**P0** = needed for the pilot prototype. **P1** = strongly desired, comes right after P0. **P2** = later.

### P0 — Must have

| ID | Requirement |
|---|---|
| P0-1 | **Language selection** at first launch and per learner profile: en-IN, hi-IN, te-IN. Choosing a language changes all UI, audio, content, feedback, and challenges. |
| P0-2 | **Facilitator mode.** Facilitator signs in once per device (online the first time, then offline using a cached session). She can create learner profiles and run sessions. |
| P0-3 | **Shared-device learner profiles.** Choose a learner by photo or avatar and first name. No passwords for learners. Many learners on one device. |
| P0-4 | **Onboarding** (≤5 min): voice consent, preferred name, business type (vegetable / tea / grocery / other), language. No financial data collected. |
| P0-5 | **Diagnostic assessment** (≤6 min): 6–8 scenario questions covering the 5 core concepts. Answers by tapping a picture, or by voice. Produces a deterministic per-concept knowledge profile. |
| P0-6 | **Curriculum of 5 modules.** (1) Revenue vs profit, (2) Expenses including hidden ones (spoilage, transport, own tea), (3) Customer credit / udhaar, (4) Saving a little every day, (5) Two pockets: separating household and business money. Each module has 2–3 micro-lessons of 5–8 minutes. |
| P0-7 | **Lesson player.** Steps: audio narration, visual scenario (illustrated stall, coins and notes, item pictures), a reflection prompt, a practice question, and feedback. Text on screen is limited to short labels and numbers. |
| P0-8 | **Business-specific scenarios.** The same concept is taught with variants for each business type (vegetable, tea, grocery). Variants are pre-authored, and their numbers come from the calculation engine. |
| P0-9 | **Comprehension checks with adaptive feedback.** On a wrong answer, the app gives a targeted hint based on the type of mistake (for example, "counted revenue as profit"). Then it offers a simpler retry. After two misses, it shows a worked example and flags the concept for the facilitator. |
| P0-10 | **Voice interaction.** Every prompt is narrated (pre-recorded audio). Learners can answer by voice in any of the 3 languages when online. If the app cannot understand the answer or is offline, tap-to-answer is always available. |
| P0-11 | **Weekly challenge.** At the end of each session, the app assigns one practical challenge linked to the module, for example "Keep tomorrow's tea money in a separate tin." The next session opens with a check-in on the challenge (done / partly / not done, plus an optional voice reflection). |
| P0-12 | **Progress tracking.** Per-concept mastery levels, completed lessons, and challenge history persist across sessions and devices (after sync). |
| P0-13 | **Learner progress screen.** Visual path of the 5 modules, mastery shown with icons and colour plus a voice summary. No percentages or scores that could feel like school grades. |
| P0-14 | **Facilitator coaching view.** Roster with last visit date and the suggested next module. Learner detail shows concept gaps, misconceptions flagged, challenge status, and 2–3 suggested talking points (generated by rules). |
| P0-15 | **Guided 20–25 minute session flow.** Check-in → review challenge → lesson → practice → new challenge → wrap-up, with a visible timer and a "short on time" path. |
| P0-16 | **Offline-first.** The core flow (P0-3 to P0-15) works with no connection once content packs are downloaded. Progress syncs when a connection returns. |
| P0-17 | **Deterministic calculation engine.** All amounts, profits, savings projections, and answer correctness are computed by tested code. |
| P0-18 | **Privacy.** No bank, account, ID, or exact income fields. Learner data is stored on the device and on an NGO server only. |

### P1 — Should have

| ID | Requirement |
|---|---|
| P1-1 | **"Try it with your numbers"** practice: the learner says or taps rough everyday figures, such as stock cost and sales, and the engine shows profit. These values are used only during the session and are **not stored**. |
| P1-2 | **AI-assisted open reflection.** A free-form spoken reflection ("What will you do with the money you save?") is transcribed and classified into one of the pre-defined themes. The facilitator sees the theme and a short transcript. |
| P1-3 | **Spaced review.** Quick 2-question recaps of earlier concepts, scheduled by a deterministic spaced-repetition rule. |
| P1-4 | **Facilitator pre-visit brief.** A one-screen summary per learner, with an optional AI-generated sentence that only rephrases deterministic data. |
| P1-5 | **Audio pack management.** Download content per language and module, show storage used, and delete unused packs. |
| P1-6 | **Low-bandwidth sync indicators** and a manual "Sync now" button. |
| P1-7 | **Accessibility.** Adjustable narration speed, replay buttons on every step, high-contrast mode, large touch targets (≥48dp). |

### P2 — Could have

| ID | Requirement |
|---|---|
| P2-1 | Independent learner mode on the learner's own phone, with WhatsApp-style voice reminders. |
| P2-2 | Program manager cohort dashboard (aggregated, anonymized). |
| P2-3 | Additional languages (Marathi, Kannada, Odia) and business types (tailoring, dairy). |
| P2-4 | Peer group sessions (one phone, 3–5 learners). |
| P2-5 | Optional bridge to bookkeeping features (explicitly out of scope now). |
| P2-6 | AI-generated scenario variants, authored offline with a human reviewer before publishing. |

---

## 4. Primary end-to-end customer journey

**Setting:** Priya visits Lakshmi at her stall. One phone (Priya's), 22 minutes, patchy 2G.

| # | Stage | Lakshmi (learner) | Priya (facilitator) | System |
|---|---|---|---|---|
| 0 | **Before the visit** | — | Opens the roster on the bus and sees: "Lakshmi — Module 2, spoilage misunderstood; challenge: set aside spoiled greens and count them." | Reads the local DB. Talking points come from rules. |
| 1 | **First visit: onboarding** (one time, ~5 min) | Hears a welcome in Telugu, gives consent by voice ("avunu"), says her name, taps the vegetable stall picture. | Takes her photo for the profile picker (optional), confirms the details. | Creates the profile locally. Records consent as an audio reference and a timestamp. No financial data. |
| 2 | **Diagnostic** (first visit, ~6 min) | Answers 7 picture scenarios: "Lakshmi sold ₹1,200 today, bought stock for ₹800 — how much did she earn?" She taps or speaks. | Helps only if asked. A "learner answered alone / with help" toggle is available. | The scoring engine builds the concept profile. Recommends a starting module. |
| 3 | **Check-in** (later visits, ~2 min) | Hears "Welcome back, Lakshmi garu." Reports on last week's challenge: "partly", plus a voice note. | Encourages her and asks a follow-up question from the suggested prompt. | Logs the challenge result. If online, the reflection is classified into a theme. |
| 4 | **Lesson** (~8–10 min) | Watches and listens to the Module 2 scenario: a basket of spinach, half of it wilted by evening. Answers a reflection question: "What happened to the money you paid for these?" | Pauses when Lakshmi tells her own story. | The lesson state machine steps through the screens. The scenario's numbers come from the engine. |
| 5 | **Practice and check** (~5 min) | Answers 3 questions. Gets one wrong (forgot spoilage). Hears a specific hint, retries, gets it right. | Sees a subtle "needed hint" marker. | The answer evaluator detects the misconception code `IGNORES_SPOILAGE`. Mastery updates by rule. |
| 6 | **New challenge** (~2 min) | Hears this week's challenge: "Each evening, put the spoiled vegetables in one bag and count them in money at the end of the week." Repeats it back by voice. | Confirms that Lakshmi understood it. | Assigns the challenge with a due date (next visit). |
| 7 | **Wrap-up** (~1 min) | Sees her path with module 2 marked "practicing" and hears one sentence of encouragement. | Adds a quick note (optional, voice or text). | Writes events to the outbox. |
| 8 | **After the visit** | Continues the challenge at her stall (no app needed). | Phone reaches 4G in town. | Background sync uploads events. The server rebuilds progress. |

---

## 5. Information architecture

```
App
├── Launch / Language picker (first run)
├── Facilitator sign-in (first run per device; cached afterwards)
│
├── Facilitator area
│   ├── Learner roster  ── search, filter by village, "visit due" sort
│   │   └── Learner detail
│   │       ├── Snapshot: next module, mastery per concept, flagged misconceptions
│   │       ├── Challenge history
│   │       ├── Session notes
│   │       └── [Start session] → Learner area (session mode)
│   ├── Add learner → Onboarding
│   ├── Content & downloads (language packs, audio)
│   ├── Sync status
│   └── Settings (UI language, narration speed, sign out)
│
└── Learner area (session mode, launched by facilitator or profile picker)
    ├── Profile picker (photo/avatar grid)
    ├── Onboarding (consent → name → business type → language)
    ├── Diagnostic
    ├── Session home ("Today")
    │   ├── 1. Check-in & challenge review
    │   ├── 2. Lesson player (narration → scenario → reflection → practice → feedback)
    │   ├── 3. New weekly challenge
    │   └── 4. Wrap-up
    ├── My journey (progress path, 5 modules, voice summary)
    └── My challenges (current + past, playable audio)
```

**Navigation rules**
- Learner screens have at most 2 primary actions, a persistent "Replay audio" button, and a "Back" button. No hamburger menus.
- Switching between facilitator and learner areas requires a long-press or the facilitator's PIN, so a learner cannot accidentally open the roster or see other learners' data.

---

## 6. Technical architecture (summary)

See `docs/ARCHITECTURE.md` for the full design. In brief:

- **Client:** Offline-first Progressive Web App (React + TypeScript), installable on low-end Android. Local storage in IndexedDB.
- **Deterministic core (on device):** content-pack loader, lesson/session state machine, calculation engine, answer scoring, misconception rules, mastery model, challenge assignment, spaced-review scheduler, facilitator talking-point rules.
- **Generative AI layer (server, optional, behind a narrow interface):** speech-to-text, mapping spoken answers to pre-defined options or themes, and (P1) constrained rephrasing of facilitator summaries. Every AI call has a deterministic fallback, and AI output never contains numbers the engine did not supply.
- **Backend:** thin API with an append-only event log, a content-pack CDN, and an AI gateway that keeps provider keys off the device.

---

## 7. Language localization strategy

1. **Three first-class locales:** `en-IN`, `hi-IN`, `te-IN`. No locale is a "translation" of English. Content is authored per locale by native-speaker educators, starting from a shared structure.
2. **Two separate layers**
   - *UI strings:* ICU MessageFormat key files (`ui.{locale}.json`) for short labels, plurals, and gender.
   - *Learning content:* locale-specific content packs (lesson scripts, scenario templates, feedback, challenges, audio files) that share **language-neutral IDs**, so progress is the same across languages.
3. **Audio first.** All core narration is **pre-recorded by native, adult female voice talent** per locale. Recordings work offline, sound warm, and avoid robotic TTS. TTS is only a fallback for dynamic strings (for example, a learner's name), and those are kept rare by design.
4. **Business glossary per locale.** Each locale has terms chosen with learners, for example profit: *munafa* (hi) / *laabham* (te); credit: *udhaar* (hi) / *appu* (te). Common English loanwords ("profit", "stock") are accepted when learners use them.
5. **Numbers and currency**
   - Currency is always shown as `₹` with Indian digit grouping (`₹1,20,000`) via `Intl.NumberFormat('en-IN')`.
   - Western Arabic digits are used by default in all locales, because they are the most familiar on price tags and phones. Devanagari and Telugu digits are a setting, to validate in research.
   - Numbers are formatted by code. Translators never type amounts into content: templates use slots like `{revenue}`.
6. **Speech recognition:** per-locale STT models. Hindi–English and Telugu–English code-mixing is expected. Answer matching uses per-locale synonym lists plus AI classification.
7. **Scripts and fonts:** Noto Sans Devanagari and Noto Sans Telugu are bundled for offline use. Layouts are tested for Telugu text, which runs longer and taller.
8. **Quality process:** source → native author → second-speaker review → field test with 3–5 learners per locale → sign-off. The content pipeline tracks missing keys and blocks a release if any P0 string or audio file is missing in any locale.
9. **Language switching:** the learner's language is set per profile and can be changed at any time. The facilitator UI language is independent (Priya may use English while Lakshmi uses Telugu).

---

## 8. Acceptance criteria (MVP)

**Localization**
- AC-L1: With the language set to te-IN or hi-IN, no English text appears on any learner screen, except numbers, `₹`, and approved loanwords. This is checked by an automated missing-key audit and a manual walkthrough.
- AC-L2: Every learner-facing prompt in onboarding, the diagnostic, lessons, feedback, challenges, and progress has recorded audio in all 3 locales.
- AC-L3: All amounts are formatted with Indian grouping in every locale.

**Session and learning**
- AC-S1: A facilitator can complete check-in → lesson → practice → challenge → wrap-up in 20–25 minutes in 4 out of 5 moderated test sessions.
- AC-S2: The diagnostic covers all 5 concepts, takes ≤6 minutes, and gives the same concept profile for the same answers every time (deterministic).
- AC-S3: A wrong answer with a known misconception produces that misconception's specific hint (not a generic "Try again") 100% of the time in automated tests.
- AC-S4: After two misses on a concept in a session, the app shows a worked example and flags the concept in the facilitator view.
- AC-S5: Every lesson has a variant for each of the vegetable, tea, and grocery business types.
- AC-S6: Each completed session assigns exactly one challenge. The next session opens with a check-in on it.

**Voice**
- AC-V1: Every question can be answered by tapping. Voice is never the only input.
- AC-V2: When online, a spoken answer is mapped to an option or shows "I didn't catch that" with tap fallback within 4 s at p90 on a 3G connection.
- AC-V3: When offline, voice input is disabled with a visible state change, and the session can still be completed.

**Calculations and AI boundaries**
- AC-C1: 100% of the numbers shown to learners come from the calculation engine. Unit tests cover every formula, and amounts are stored as integers (whole rupees or paise).
- AC-C2: Any AI output containing a number that the engine did not supply is rejected and replaced with the pre-authored fallback. This is verified by automated tests with adversarial outputs.
- AC-C3: The app has no free-text chat entry point.

**Offline and sync**
- AC-O1: With airplane mode turned on after content download, a full session including a new learner's onboarding completes with no errors.
- AC-O2: Events recorded offline on two devices for the same learner merge without data loss after sync.
- AC-O3: The initial content download per language is ≤40 MB (target), and the app shell is ≤3 MB.

**Facilitator**
- AC-F1: The roster loads offline in <2 s for 50 learners on a reference low-end device (2 GB RAM Android).
- AC-F2: The learner detail screen shows per-concept mastery, flagged misconceptions, challenge status, and ≥2 talking points.

**Privacy and respect**
- AC-P1: The data schema contains no fields for bank account, ID number, phone number of the learner (optional, P2), or income.
- AC-P2: Consent is captured in the learner's language before any data is stored.
- AC-P3: Tone review: 3 adult learners per locale say the content does not feel childish or patronizing (moderated test).

---

## 9. Risks and assumptions requiring validation

| # | Assumption / risk | Why it matters | How to validate | Mitigation if wrong |
|---|---|---|---|---|
| A1 | Facilitator phones are mid-range Android with Chrome ≥110 | The PWA, IndexedDB, and audio playback depend on it | Device inventory survey with the NGO | React Native/Capacitor wrapper |
| A2 | Learners respond better to picture + audio than to text | This drives the whole UI | Paper and clickable prototype tests in each locale | Increase text support for more literate learners |
| A3 | Commercial STT is accurate enough for rural Telugu/Hindi with background stall noise | Voice is a headline feature | Record 50 sample answers per locale in the field and measure option-match accuracy (target ≥85%) | Keep tap as the primary input and make voice an enhancement |
| A4 | Weekly visits are consistent enough to keep a weekly challenge rhythm | The challenge loop depends on it | Visit logs from the NGO | Allow challenges to span 2 weeks |
| A5 | Western digits are preferred over native-script digits | Readability | A/B preference test during field tests | Locale setting already supports both |
| A6 | Learners are comfortable discussing money in front of a facilitator (and sometimes family) | Honest answers, trust | Facilitator interviews | Fictional "neighbour" scenarios instead of first-person ones |
| R1 | Shared device leaks one learner's data to another | Privacy and trust | Threat walkthrough | Facilitator lock, no cross-profile browsing in learner mode |
| R2 | AI misclassifies a spoken answer as correct | False mastery | Measure the false-positive rate | Confidence threshold, confirmation step ("Did you say ₹400?"), and a high-confidence AI match counts at most as "practicing", never "confident", alone |
| R3 | Content authoring cost across 3 locales × 3 business types | Timeline | Pilot one module end-to-end first | Shared templates with slots, a phased rollout of modules |
| R4 | Audio packs too large for limited storage and data plans | Adoption | Measure on test devices | Opus 24 kbps compression, download per module |
| R5 | Learners feel tested or judged | Engagement and dignity | Tone review, observation | Avoid scores, frame questions as "what would you do", frame the diagnostic as "let's see where to start" |
| R6 | AI costs and latency on poor networks | Experience and budget | Load test | Short audio clips, server-side caching, AI optional |
| R7 | Facilitator workload rises instead of falling | Adoption by the NGO | Time-and-motion study | Pre-visit brief, auto-paced sessions |
| R8 | Regulatory and data-protection requirements (India DPDP Act 2023) | Compliance | NGO legal review | Data minimization, consent records, deletion on request |

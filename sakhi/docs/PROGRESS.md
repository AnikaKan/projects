# Learner progress, weekly challenges and Coach View

Status: implemented on 2026-10-28 as a **class prototype**. All learners are fictional. Data is stored in the browser's localStorage. There is **no sign-in and no access control**, and the Coach View says so in a banner on every screen.

## 1. Learner profile (typed schema v1)

`app/src/progress/types.ts`. A profile is a small identity record plus an **append-only event log**. Everything on the learner's progress screen and in the Coach View is *derived* from the log by pure functions (`progress/engine.ts`). The same events give the same picture in every language and on every device.

| Field | Content | Notes |
|---|---|---|
| `learnerId` | Fictional code, e.g. `DL-03` | Enforced format `AA-00`. Phone numbers and names are rejected. |
| `alias` | Fictional display alias per script (en/hi/te) | Demo only. A real deployment would let the learner choose a nickname, with consent. |
| `language`, `business` | Selected language; vegetable / tea / grocery | Changes are logged as events. |
| `onboarded`, `isDemo`, `createdAt` | — | — |
| `events[]` | `session_started`, `language_changed`, `business_changed`, `assessment_completed`, `lesson_started`, `answer`, `lesson_completed`, `challenge_assigned`, `challenge_declined`, `challenge_checkin`, `coach_override`, `coach_reviewed_lesson` | Every answer stores the option outcome, the misconception code and a `firstTry` flag. It never stores free text from questions. |

**Never stored:** real names, phone numbers, addresses, banking details, income, or business transaction records. Two kinds of free text exist: the optional learner difficulty note and the optional coach note. Both are ≤ 140 characters and refused if they look like a phone, account or ID number (the same `containsPersonalData` guard used for AI requests). A test checks that a stored profile has exactly the documented fields.

Lesson position (for resume) stays in the existing per-lesson store `hisaab.lesson.v1.<learnerId>.<lessonId>`. Assessment sessions stay in `hisaab.assessment.v1.<learnerId>`. Both are keyed by learner and lesson, never by language.

## 2. Progress rules (deterministic)

| Level (learner wording) | Rule |
|---|---|
| **Not started** | No answers and no lesson started for the concept. |
| **Introduced** | Assessment answers only, or a lesson started without any practice answers yet. |
| **Practising** | At least one lesson or practice answer on the concept. |
| **Shown understanding** | The last two *first-try* answers on the concept are correct, on two different questions, and the latest answer is correct. Or the latest lesson result is "understood" with no miss since. It is never claimed from one correct answer, and a later miss drops it back to Practising. |

The word "mastered" is never used.

**Needs more practice** is shown when a concept is Introduced or Practising and at least one of these is true:
- an open misconception
- 2+ misses in the last 5 answers
- the last lesson result was not "understood"
- an assessment gap with no lesson completed since
- the last answer was missed

The reasons are listed in the Coach View.

**Lessons** track starts (first time, "start again" and redo all count), completions, last result (understood / developing / needs review) and the step to resume at.

**Recommended next lesson** = the existing assessment `recommend()` rules applied to the derived levels:
1. open misconception
2. unsure
3. next topic not yet covered
4. next in the path

A coach override takes precedence until that lesson is completed or the coach reverts it.

## 3. Weekly challenges

`app/src/progress/challenges.ts` holds the approved activities (en/hi/te; Hindi and Telugu are drafts pending review):

| ID | Kind | Activity |
|---|---|---|
| `rvp.main` | main (lesson 1) | The lesson's own business-specific activity (count sales, take away goods cost, 3 evenings) |
| `rvp.oneEvening` | smaller | The same for just one evening |
| `rvp.explain` | easier | Explain sales vs profit to someone at home |
| `exp.oneExpense` | stretch | Identify one forgotten business expense |
| `sep.twoPlaces` / `sep.oneDay` | main / smaller | Keep business and household money in two places |

- **After a lesson**, the challenge step offers exactly one approved activity ("I'll do this" assigns it; "Not now" is recorded as declined). A new activity replaces an unchecked earlier one.
- **At the next session** (a coach starts a session, or the learner returns after more than 4 hours), Home shows "Last week's activity – Tell us how it went". The check-in asks *Yes / Some of it / Not yet*. For partly or not yet, it then offers optional difficulty chips (no time, forgot, hard to count, not sure what to do, shop closed, other) and an optional short note.
- **Follow-up rule:**
  - done → stretch activity
  - not clear / hard to count → easier activity, plus "Hear the lesson again"
  - partly, or not yet for practical reasons → smaller version
  - The learner can accept it or say "Not now".
- **Tone:** the messages say things like "That's okay. Busy weeks happen." A test checks every check-in message in all three languages against a list of critical words.

## 4. Coach View (facilitator dashboard, `#/coach`)

- **Header:** a prototype banner, a coach language switch (en/hi/te via the shared localisation system, independent of each learner's language), and **Reset demo data** with an in-app confirmation.
- **Roster:** alias, fictional ID, business, learner language, next lesson. Badges show *New*, *Check-in due*, *Needs practice · n* and last activity. You can search by alias or ID and filter by needs attention or weekly challenges.
- **Learner detail:**
  - Profile
  - **Recommended next lesson** with the rule reason, or "Changed by coach: reason" and what the app suggested
  - **Review lesson:** explanation, business example, key rule and activity, each playable in the learner's language by default or in any language
  - **Change next lesson:** pick a lesson plus a **required reason code**, with an optional screened note. It is logged, and you can revert to the app's suggestion.
  - **Support during the session:** talking points chosen by rules (check-in due, resume, misconception prompts, practice), "Open the lesson with her", and "Start session"
  - Assessment summary per concept
  - Understanding by concept, with needs-practice reasons
  - Lessons (starts, completions, result, stopped at)
  - Misconceptions (open and resolved, times seen)
  - Weekly challenges with status, difficulties and notes
  - Change log

## 5. Data access and demo

- `ProgressRepository` interface (`list / get / save / remove / subscribe`). `LocalProgressRepository` implements it over the `KeyValueStore` abstraction (localStorage, or memory in tests and private mode). It validates stored data at runtime and ignores invalid records.
- **Future backend:** keep the same interface over a local cache. Sync the append-only events (they merge without conflicts per learner). Rebuild views on the server with the same pure `deriveProgress`. Reads stay synchronous, so offline use is unchanged.
- **Demo learners** (`progress/demo.ts`) are produced by the real engines (assessment, lesson state machine, check-in) with timestamps relative to the seed time:

| ID | Situation |
|---|---|
| DL-01 | New learner (the learner flow starts here) |
| DL-02 | Telugu, vegetable. Assessment "sales = profit"; lesson 1 stopped at Practice (resume). |
| DL-03 | Hindi, tea. Lesson 1 "developing"; activity due for check-in at the next session. |
| DL-04 | Hindi, grocery. Lesson 1 understood; activity done → stretch; coach override with reason. |
| DL-05 | English, tea. Activity "not yet – no time" → smaller version; extra practice answers. |

- **Reset demo** removes every key starting with `hisaab.` or `hisaab-saathi-`, leaves other keys alone, and re-seeds.

## 6. Privacy, access control and consent: what production needs

This prototype has **no authentication**, so anyone with the device can open the Coach View. Before any real learner data is used:

1. **Role-based access control.** Possible roles:
   - *Learner*: own profile only.
   - *Field coordinator*: learners assigned to her group.
   - *Programme manager*: aggregated, de-identified cohort reports only.
   - *Admin*: account management, no learner content by default.
   - Enforce roles on the server for every read and write, not in the UI.
   - Record the acting coordinator on `coach_override` and `coach_reviewed_lesson` events. The prototype cannot, because it has no sign-in.
   - Shared-device mode: a PIN or pattern per learner profile, and the Coach View behind a coordinator login with automatic lock.
2. **Consent.**
   - Get informed consent in the learner's language, by voice or picture, before creating a profile. Record what is stored, who can see it, and for how long.
   - Consent must be revocable, with export and deletion on request.
   - Coordinators' notes are part of the learner's record.
   - Get separate opt-in for any cloud speech or AI processing.
   - Align with India's DPDP Act 2023 and the NGO's own policy (PRD risk R8), with legal review.
3. **Minimisation and retention.**
   - Keep fictional or pseudonymous IDs.
   - Keep any real name separate from progress data, and only if the NGO needs it.
   - Set retention limits for event logs.
   - Encrypt at rest on the device and in the backend.
   - Write audit logs for coordinator access.
4. **Integrity.** Today the client can write any event. A backend must validate events (approved challenge IDs, lesson IDs, reason codes) and keep coordinator actions attributable.

## 7. Verification (actual results, 2026-10-28)

- **Unit and UI tests: 412 / 412 pass** (20 files). 31 are new:
  - `progress/__tests__/engine.test.ts`: 20 tests covering schema and privacy, persistence, levels, lesson completion and repeated attempts, challenge assignment, incomplete check-ins and follow-ups, language switching, coach adjustments, and demo/reset.
  - `progress/__tests__/progressUI.test.tsx`: 11 tests covering check-in flows, progress screen language switching, resume, practice recording, Coach View sections, override with reason, review/replay, en/hi/te Coach View, dashboard updates after a learner check-in, and reset.
  - Existing lesson and assessment tests were updated to the new progress model.
  - Typecheck is clean and the production build is OK. Vite now warns that the main JS chunk is over 500 kB. It is not split yet.
- **Browser run (Chromium 153, production build, desktop + 375 px phone):**
  - Coach roster en/te and override persisted across reload.
  - DL-02 lesson review defaulted to Telugu.
  - DL-03 start session → Hindi Home check-in → phone-number note refused → easier follow-up accepted.
  - Progress levels identical after switching hi → te.
  - The coach saw the check-in, difficulty and new learner language.
  - Reset cleared the override.
  - DL-01 full flow (onboarding → assessment → lesson → activity) appeared in the Coach View as completed / shown understanding.
  - No horizontal overflow on phone screens, and no page errors.
  - The earlier lesson, speech and offline browser suites still pass.
- **Not verified:**
  - Hindi and Telugu wording: native-speaker review is still needed.
  - Behaviour with real coordinators or learners.
  - Any multi-device sync: there is no backend.

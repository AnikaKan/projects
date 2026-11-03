# Coaching logic: rules behind the Coach View

**Date:** 2026-11-01.

**Code:**
- `src/coaching/model.ts`: rules and the data model
- `src/coaching/explain.ts`: wording of explanations
- `src/coaching/playbook.ts`: approved coaching content
- `src/coaching/sessionContent.ts`: practice questions
- `shared/coachWording.mjs`: AI output guard

**Properties of every rule here:**
- **Pure and deterministic.** No clock reads (callers pass `now`), no network, no AI. The same learner record always gives the same result, in any language.
- **Learner-specific.** Each rule reads exactly one learner's own event log. It never reads another learner's.
- **Thresholds are design assumptions.** Examples: 2 days, 14 days, 2 independent answers. They are **not validated** with coordinators or learners (§9).

## 1. Data model

New append-only events (in `progress/types.ts`):

| Event | Written when |
|---|---|
| `coach_accepted { lessonId, level, ruleId }` | Coach taps **Accept** (a snapshot of what was accepted) |
| `coach_override { fromLessonId, toLessonId, reason, note?, ruleId? }` | Coach changes the lesson. `ruleId` is new and records which rule was overridden |
| `coach_level_set { level \| null, fromLevel, reason, note? }` | Coach changes the level (`null` = back to the diagnostic level) |
| `challenge_checkin { …, by?: 'coach' }` | Check-in recorded in a session (`by` is new) |
| `challenge_verified { recordId, result: explained \| partly \| notYet }` | Coach checks whether she can explain an activity she did. **Also** recorded as an `answer` event (`source: practice`, `itemKey: coach:verify:<recordId>`; explained = correct, partly = unsure, notYet = incorrect) so it counts as evidence for the topic |
| `coach_note { categories[], text?, sessionId? }` | Note saved |
| `coach_session_started { sessionId, lessonId, level, ruleId }` | Session started. The session's plan (lesson and level) is **fixed here**, so practice content does not shift while she answers. A learner `session_started` (by coach) is added at the same moment |
| `coach_session_step / _paused / _completed { sessionId, step? }` | Step navigation, pause, completion |
| `answer { source: practice, itemKey: coach:<sessionId>:<question> }` | Practice answered in a session. `firstTry` is true only for the first answer to that question |

Every derived view (status, level, recommendation, follow-up, sessions) is computed from these events. Nothing derived is stored.

## 2. Learning level (`learningLevel`)

| Rule | Result |
|---|---|
| L0 | Value = the coach's level if set (latest `coach_level_set` with a level), else the diagnostic **tier** (DIAGNOSTIC_STRATEGY.md), else Foundational with source `none` ("Not checked yet") |
| L1 | **The level never changes automatically.** The app only *suggests* |
| L2 · suggest moving up | All of these must hold: the learner is Foundational; since the diagnostic (or the coach's last level change) she has ≥ **2 different questions** right on the **first try** (lesson / practice / coach practice, MVP-core topics); no open misconception on an MVP-core topic; her last such answer was right. One correct answer is never enough, and repeating the same question does not count (tested) |
| L3 · suggest moving down | Intermediate, ≥ 2 different first-try misses on MVP-core topics since then, and an open MVP-core misconception |

**What uses the level:**
- the playbook entry (foundational / intermediate wording)
- the session's practice question
- the learner app's practice (`practiceStartsEasy` now uses the coach's level when set)

## 3. Recommendation and "Why this lesson?"

### 3.1 Which lesson

The lesson comes from the **existing** rules (`recommend()` in the assessment engine, via `deriveProgress`). They are unchanged.

### 3.2 Rule ids

| Rule id | When | Headline (en) |
|---|---|---|
| `R0_NO_HISTORY` | No diagnostic and no answers at all | "No first check yet, so there is no learning history to explain." Action: do the 5-question first check |
| `R1_MISCONCEPTION` | A foundational misconception on the topic (diagnostic, lesson or practice) | "Her answers show a common mistake: ⟨label⟩." |
| `R2_UNSURE` | The rules' "unsure" level **and** she actually answered "Not sure" on this topic | "She was not sure about this topic." |
| `R2B_IN_PROGRESS` | The rules' "unsure" level **without** a saved "Not sure" answer (started the topic, still practising, lesson not finished) | "She has started this topic but has not finished the lesson yet." Split out so the app never says "she was not sure" without that answer |
| `R3_APPLIED_GAP` | Basic question right, harder question with numbers wrong | "She knows the basic idea but missed the harder question with numbers." |
| `R4_NOT_ASSESSED` | Topic not asked | "This topic was not covered in her first check." |
| `R5_NEXT_IN_PATH` | No open difficulty | "No open difficulty in her answers. This is the next topic in the learning path." |
| `C1_COACH_CHOICE` | Coach override active | "You chose this lesson: ⟨reason⟩. The app suggested ⟨lesson⟩: ⟨rule headline⟩". The rules' own lesson, rule and misconceptions are kept in `rules` |

### 3.3 Structured object

`CoachingRecommendation` contains:

| Field | Meaning |
|---|---|
| `learnerId`, `recommendedLessonId`, `recommendedLevel` | Who, which lesson, which level |
| `misconceptionIds` | Open ones on the topic; else the ones seen in the diagnostic |
| `supportingEvidence[]` | Every saved fact, each pointing at a stored event by index and timestamp |
| `keyEvidence[]` | ≤ 3 for the default view |
| `reason` | The rule reason code |
| `suggestedCoachingAction` | `{ topic, level }`, a playbook reference rendered per language |
| `recommendationRuleId` | One of the rule ids above |
| `evidenceStrength` | See §3.5 |
| `otherNeeds[]` | Other topics needing work, in path order |
| `rules` | `{ lessonId, ruleId, reason, misconceptionIds }`: what the rules alone say, kept during an override |
| `override`, `levelSource`, `acceptedAt` | The coach's decisions |

### 3.4 Evidence collection (for the recommended topic only)

| Kind | Source event | Sentence (en) |
|---|---|---|
| `diagnostic` | `answer` with `source: assessment` and outcome misconception / unsure | First check: to "⟨question rendered for the business she had then⟩" she answered "⟨the option that carries that misconception code⟩". Harder questions say "Harder first-check question" |
| `lessonMiss` | `answer` with `source: lesson`, not correct | Lesson "⟨title⟩", "⟨step⟩" question: ⟨misconception⟩. Adds "She got it right on a later try" only if a later correct answer to the same question exists |
| `practiceMiss` | `answer` with `source: practice`, not correct (app or coach) | Practice in the app / with the coach: ⟨misconception⟩ |
| `practiceCorrect` | Lesson and practice answers, all right | In lessons and practice: c of n answers right |
| `notPractised` | No lesson or practice answers | Not practised in lessons yet |
| `lessonResult`, `challenge`, `verification` | `lesson_completed`, `challenge_assigned` / `checkin`, `challenge_verified` | Lesson finished: ⟨result⟩ · Weekly activity: ⟨status⟩ (barrier: …) · Coach check: … |
| `diagnosticCorrect` | Only for R5 | Her saved answers show no open mistake on any topic |

**Default 3 points**, in this order:
1. the diagnostic point
2. the lesson / practice point (a miss if any, else the "did well / not practised" point)
3. the coach check, else the activity, else the lesson result

### 3.5 Evidence strength

Count the independent signals of difficulty. Each counts once:
- diagnostic
- lesson
- practice
- activity partly or not done
- coach check not "explained"

| Signals | Strength | What is shown |
|---|---|---|
| ≥ 2 | **clear** | Evidence only |
| 1 | **limited** | "Recommended based on the initial assessment. More practice is needed to understand this learning need." when the only signal is the diagnostic; "Based on one answer only. …" otherwise |
| 0 | **none** | For R1–R3 and C1: "No saved answers show a difficulty with this topic yet." |

### 3.6 Why this first

| Case | Sentence |
|---|---|
| Other needs all come later in the MVP order | "It comes before ⟨topics⟩ in the learning path, and those lessons build on it." |
| A later topic was ranked first by the rules (a clear mistake beats "not sure") | "This difficulty is clearer than the others (⟨topics⟩), so it comes first." |
| R0 / R5 / C1 | Fixed sentences (path start / earlier topics done / coach's choice, evidence kept) |

### 3.7 Guarantees (tested)

| Guarantee | Test |
|---|---|
| Every evidence item points to a real stored event of the matching type and outcome | `evidenceIsGrounded`, for every demo learner |
| Nothing is invented: a learner whose practice answers were right never gets a "struggled in practice" sentence | Unit test |
| A learner with no history gets R0 and no diagnostic claims | Unit test |
| Same record → byte-identical recommendation | Determinism test |
| Language changes only the wording: en / hi / te have the same number of points and the same amounts (500, 300, 500 for Saraswathi) | Unit test |

## 4. Coaching action (playbook)

`PLAYBOOK[lang][topic][level] = { action, activity, question }`, plus `learn` and `verify` per topic, and a `start` entry for R0. It is filled with:
- her alias
- business words (`BUSINESS_WORDS`, e.g. vegetables / milk, tea leaves and sugar / stock)
- amounts from the **first diagnostic item** for her business: vegetable ₹500 / ₹300, tea ₹400 / ₹250, grocery ₹800 / ₹600

So the picture matches what she saw.

**Scope test.** Every filled line, in every language × business × level, must pass:
- no loans / borrowing / interest / investment / insurance / gold / schemes / products (`mentionsAdviceTopic`)
- no promises (`makesUnsupportedClaim`)
- no personal data
- no unfilled placeholders
- only amounts from the item bank

The credit entries avoid bookkeeping ("make two piles", not "write down who owes you").

**Example (brief).** Saraswathi, vegetable stall, sales = profit, foundational:

| Field | Text |
|---|---|
| Action | "Help Saraswathi see that selling ₹500 of vegetables does not mean she earned ₹500 in profit." |
| Activity | "Show the picture: ₹500 in sales and ₹300 for the vegetables. Ask how much is left after paying for the vegetables sold." |
| Follow-up | "What other costs might reduce the money she keeps?" |

**Why this lesson?**
- "First check: to 'You sold ₹500 worth of vegetables and spent ₹300 on the vegetables sold. Is your profit ₹500?' she answered 'Yes'."
- "Lesson 'Sales and profit', 'Your turn' question: Counts all sales money as profit. She got it right on a later try."

## 5. Weekly activity follow-up (`challengeTracking`)

**Due.** An agreed activity is **due** for a check when either:
- the learner app's own rule says so (assigned in an earlier learner session), or
- it is ≥ **2 days** old (coordinators visit about weekly; an assumption)

| Rule | Situation | Suggested follow-up |
|---|---|---|
| F0 | No activity yet | Agree a first activity at the end of the next session |
| F1 | Due, not checked | Ask ⟨name⟩ whether she did it, and what happened |
| F2 | Reported **done**, not checked by coach | Playbook `verify`, e.g. "Ask ⟨name⟩ to name the costs she found and explain how they change what is left after sales." Plus: "Done does not always mean understood." |
| F3 | Done and explained | Agree the next activity |
| F3B | Done but only partly / not explained | Go over the example again first |
| F4 | Partly | Ask what got in the way; offer the smaller version |
| F5 | Not done, "not sure what to do" / "hard to count" | Replay the lesson example, then the easier activity |
| F6 | Not done for practical reasons | Smaller version; agree one evening |

**Next activity.**
- The one already agreed, if any.
- Otherwise, the existing deterministic follow-up plan (`planFollowUp`: stretch / smaller / easier).
- Otherwise, the recommended lesson's main activity.

Only **approved** activities are ever offered.

## 6. Status (`coachSummary`)

| Status | Rule (first match) | Reasons shown |
|---|---|---|
| 🚩 **Follow up** | No first check yet; or an open / paused coaching session; or F1; or F2; or F4–F6 with no smaller / easier follow-up agreed; or no activity for **14 days** | `noCheckYet`, `sessionPaused`, `challengeNotChecked`, `challengeToVerify`, `challengeBarrier`, `inactive` |
| 🔁 **Needs practice** | Any open misconception; any topic with `needsPractice` (existing progress rules); or the coach check was partly / not yet | `openMisconception`, `conceptNeedsPractice`, `couldNotExplain` |
| ✅ **Doing well** | None of the above | `onTrack` |

**Ready for next lesson:** ≥ 1 lesson completed, no completed-lesson topic needs practice, and the recommended lesson is not started.

**Demo data now** (fictional, built by the real engines):

| Learner | Status | Rule |
|---|---|---|
| DL-01 Lakshmi | Follow up | R0 |
| DL-02 Saraswathi | Needs practice | R2B, clear evidence |
| DL-03 Sunita | Follow up (activity due) | R1, limited evidence |
| DL-04 Farzana | Follow up | C1 (coach chose Everyday costs; app said Customer credit) |
| DL-05 Meena | Follow up | R1 from a practice answer (limited); moveDown suggested |
| DL-06 Kavitha | Doing well, ready for the next lesson | R5 |

## 7. Guided session rules

- **Start / resume.** "Start" creates `<learnerId>-cs<n>` only if no session is open. Otherwise it **resumes** the open or paused one at its last step, and does not add another learner session.
- **The plan is fixed at start.** The lesson, level and topic come from the recommendation at that moment, so recording an answer cannot swap the question mid-step (a bug found and fixed in testing).
- **Practice content** (`practiceFor`):

  | Topic and level | Question |
  |---|---|
  | Sales and profit, foundational | The two-number scenario |
  | Sales and profit, intermediate | The scenario with spoiled goods |
  | Everyday costs, intermediate | The scenario with spoiled goods |
  | All other topics and levels | The approved item-bank question of that level (form A / B) |

  Numbers and correct answers come from `lib/calc.ts` or the item bank. Wrong answers are tagged with a misconception only when they are the number that misconception produces.
- **Complete.** `coach_session_completed`. After it, recording into that session throws.
- **What counts toward progress.** Check-ins, the coach's check, practice answers (first try = independent evidence) and the agreed activity flow into the normal progress view (levels, misconceptions, `needsPractice`) through the existing `deriveProgress`.

## 8. Optional AI wording (`/api/coach-wording`)

| Step | Detail |
|---|---|
| Input | One playbook sentence, the language and her alias. **No** history, answers, evidence or IDs |
| Model call | The existing Claude configuration (`claude-haiku-5-5`, structured JSON output `{ text }`) |
| Pre-check | Rejects source text that mentions advice topics or personal data |
| Post-check (`validateRewrite`, server **and** browser) | Non-empty; ≤ min(240, source + 20) characters; no lists; keeps her name; only the source's amounts; right script; no advice / claim / personal-data words |
| Failure or no key | `{ ok: false }`; the approved sentence stays |

The evidence, headline and reasons are **never** sent to or written by the model.

## 9. Assumptions to validate

| Assumption | How to test |
|---|---|
| 2 independent first-try answers are enough to *suggest* Intermediate | Compare with coordinator judgement for 20 learners |
| An activity is "due" after 2 days; "inactive" after 14 | Pilot visit logs |
| "Done ≠ understood" check questions are answerable in < 1 minute | Coordinator walkthrough |
| The playbook actions are what coordinators would actually do | Coordinator review of every entry |
| ≤ 3 evidence points are enough to trust or reject a recommendation | Walkthrough: can they explain why, and when would they override? |
| Override reasons cover real cases | Count "Other" in pilot logs |

# Coach View design: a coaching assistant for field coordinators

**Date:** 2026-11-01.

**Status:** implemented in the prototype and tested (see COACH_VIEW_TEST_RESULTS.md).

**Not yet tested with NGO coordinators.** Every statement below about what coordinators need or find easy is a **design assumption** until moderated testing happens (§9).

**Related:**
- Rules: COACHING_LOGIC.md
- Code: `src/coach/` (screens), `src/coaching/` (logic)

**Screenshots:**
- `docs/img/coach-mobile-en.png`: home, profile with "Why this lesson?", session check-in, practice and action
- `docs/img/coach-desktop-en.png`: two-column layout
- `docs/img/coach-profile-te.png`: Telugu
- `docs/img/coach-offline.png`: offline

## 1. What changed and why

The old Coach View was a dashboard. It had per-concept levels, an assessment table, a lessons table, a misconception list and a change log, and every block carried the same visual weight. It answered "what does the data say?", but not "what do I do in the next 20 minutes?".

The new Coach View is organised around the coordinator's four questions:

| Coordinator's question | Where it is answered |
|---|---|
| 1. Who needs my help? | **Coach home:** four counts plus one list, most urgent first, each learner with one colour-and-word status and its main reason |
| 2. What is she struggling to understand? | **Profile → "What should we work on today?"** and **"Why this lesson?"**, built only from her saved answers |
| 3. What should I do in our next session? | **Coaching action, activity and follow-up question** (from an approved playbook), then **"Start coaching session"**: a guided 5-step, ~20-minute flow |
| 4. Did she apply what she learned? | **Weekly activity:** her report (completed / partly / not completed / not yet checked), barriers, and a **coach check of whether she can explain it**, because "done" is not "understood" |

**Not built:** no charts, scores, percentages or trend lines (the brief says no generic analytics). Progress is shown as dots, chips and short words.

## 2. Screens

### 2.1 Coach home (`/coach`)

**Header** (terracotta, the learner app's palette):
- title
- language switch: English · हिन्दी · తెలుగు, plus "+" for বাংলা · অসমীয়া · தமிழ் marked "Coming soon"
- 💾 "Saved on this phone", which becomes 📴 "Offline: everything still works…" when offline
- reset (asks for confirmation) and exit

**Banner** (every screen): "PROTOTYPE · fictional demo learners · no sign-in or access control · No server sync in this prototype: data stays on this device."

**Four count tiles** (tap one to filter the list):

| Tile | Rule |
|---|---|
| 👩 Active learners | Any activity, or created, in the last 14 days |
| 🚩 Need attention | Status is not "Doing well" |
| 🗓️ Activities to follow up | Activity due for a check, done but not yet checked for understanding, or not done with no smaller version agreed |
| ▶️ Ready for next lesson | At least one lesson completed, nothing on those topics needs practice, and the recommended lesson is not started |

**Learner list.** Each row shows:
- a business picture (🥬 ☕ 🏪)
- fictional name and ID
- business and her language
- current topic (topic picture and name)
- level: 🌱 Foundational, 🌿 Intermediate, or ⚪ Not checked yet
- status chip, each with a word as well as a colour:
  - 🚩 **Follow up** (marigold)
  - 🔁 **Needs practice** (rose)
  - ✅ **Doing well** (green)
- one reason line, e.g. "Activity not checked yet"

Rows needing attention have a coloured left edge. The list is sorted Follow up → Needs practice → Doing well.

### 2.2 Learner profile (`/coach/learner/:id`)

Top to bottom (one job per block):

1. **Who she is.** Name, "Fictional demo learner · ID", status and level chips, business, language, and the reasons she needs attention. "📱 Open her app on this phone" hands the phone to her.
2. **💡 What should we work on today?** The lesson and its level, then:
   - 🎯 **coaching action**, in bold: the one thing to do
   - 🖼️ **activity**
   - ❓ **follow-up question**

   Buttons:
   - **❔ Why this lesson?**
   - **✓ Accept**
   - **✏️ Change** (lesson and/or level, reason required)
   - **✨ Simpler words (AI)** (optional; §5)

   If the topic has no in-app lesson yet, the card says "👩‍🏫 Not in the app yet: teach it with the activity below."
3. **🗓️ Weekly activity.** Last week's activity in the coach's language, its status, barriers, and "Could she explain it?" (Yes / Partly / Not yet) when she reported it done. Then 👉 **Suggested follow-up** and **Next activity** (agreed, or suggested).
4. **🌱 Progress.**
   - Lessons completed, as 5 dots plus "n of 5".
   - ✅ Understood and 🔁 Needs more practice chips.
   - The five topics, each with its 🌱 / 🌿 / 🌳 level and lesson status.
   - Mistakes found: still open or fixed later.
   - A one-line first-check summary.
5. **Learning level.** The current level and where it came from: from the first check, or set by the coach. "The level never changes automatically." Shows a 💡 suggestion when the rules see one. "Change level" requires a reason.
6. **📝 Coach notes.** The last 5 notes, plus "Add note".
7. **🕘 Coaching history.** Accepts, lesson changes, level changes, completed sessions, lesson reviews.
8. **Sticky footer:** **▶ Start coaching session**, or **▶ Resume session · step n of 5**.

### 2.3 "Why this lesson?" (optional, collapsed by default)

| Block | Content |
|---|---|
| Headline | The rule in one sentence, e.g. "She has started this topic but has not finished the lesson yet." / "Her answers show a common mistake: Counts all sales money as profit." |
| 📋 From her saved answers | **At most 3 points by default**, from her own record: the diagnostic question in her business, with the answer she chose; whether she struggled with the same idea in a lesson or practice (or did well, or has not practised); her weekly activity or the coach's check. "Show all n points" reveals the rest |
| ⚠️ Limited evidence | When only one answer supports the rule: "Recommended based on the initial assessment. More practice is needed to understand this learning need." |
| 📘 What she needs to learn | One line from the playbook |
| ⬆️ Why this first | Why it outranks her other needs, e.g. "It comes before Everyday costs in the learning path, and those lessons build on it." |
| Rule id | Small, e.g. "Rule R1_MISCONCEPTION", so a coordinator or supervisor can look it up in COACHING_LOGIC.md |

No technical terms ("confidence", "inference") are used. Evidence is never written by AI.

### 2.4 Guided coaching session (`/coach/learner/:id/session`)

The **stepper** has five big buttons, any of which can be tapped to jump to that step:

| Step | Icon | ≈ min |
|---|---|---|
| Check in | 👋 | 3 |
| Review | 🔁 | 4 |
| Teach | 📖 | 6 |
| Practice | ✏️ | 4 |
| Action | 🚩 | 3 |

The footer has **Back** and **Next · ⟨step⟩**, and **✓ Mark session complete** on the last step. **💾 Save and finish later** is always visible.

**"Her language"** (en / hi / te, ★ marks her preference) switches only the **learner-facing** content. The coach's labels stay in the coach's language, and her saved language does not change.

| Step | What the coordinator sees (short prompts, no script) | What is saved |
|---|---|---|
| 1 · Check in | Last week's activity in her language, with **Play for her** (🔊). Big buttons: ✅ Completed · 🌗 Partly · ⏳ Not completed, then barrier chips if not done. If done: "Done does not always mean understood" plus the playbook's check question, and Yes / Partly / Not yet | Check-in (marked `by: 'coach'`); the coach's check |
| 2 · Review | The difficulty she had on this topic (from her record), the picture 🧺 sales − 📦 cost = 💰 ? (amounts from the item bank, with a "Show what is left" reveal), the idea in her language with 🔊, and "Ask her: …" | Step visited |
| 3 · Teach | Lesson in the app: **Open the lesson on this phone** (pauses the session and hands the phone to her) plus the lesson's key parts with **🔊 replay** in any of the 3 languages. No in-app lesson: says so, with the playbook activity and the idea to play for her. No first check yet: **Start the first check on this phone** | Pause when handing over |
| 4 · Practice | One question about her own type of business, at the session's level, in her language with 🔊. Tap the answer she gives; feedback; Try again | Practice answer(s), first try marked |
| 5 · Action | The suggested activity (the rule's follow-up, or the lesson's main one) with 🔊 and **🚩 Agree this activity**, or "Choose another" (approved activities only). Then a **Quick observation** (note categories plus optional text) | New activity, note |

**Recorded in this session** lists only what was actually saved, read from her record (e.g. "Practice: 1 of 2 right").

**Completion.** **Mark session complete** shows ✅ "Saved to Saraswathi's progress on this phone" and the summary.

### 2.5 Notes

| Part | Detail |
|---|---|
| Tap categories | Understood the concept · Needs more practice · Difficulty with language · Difficulty using the app · Could not complete the activity · Other observation |
| Optional short text | ≤ 140 characters; "No phone numbers, bank details or real amounts." Refused if it looks like personal or banking data (same screen as the learner app) |
| Saving | A note needs at least one category or some text |

## 3. Visual design

| Need | Response |
|---|---|
| Same family as the learner app | Terracotta header, cream background, white cards, marigold for "listen" / attention, rose for "needs practice", green only for "doing well / right" |
| Limited time, long text is hard | One bold coaching action per learner; evidence collapsed; reasons as chips; at most 3 evidence points by default |
| Status at a glance | Colour, icon and word together (never colour alone) |
| Large touch targets | Primary 56–60 px; session steps 64 px; choices 60 px; secondary ≥ 44 px |
| Business-specific | 🥬 / ☕ / 🏪 pictures; amounts and wording per business |
| Phone first | Single column at 360 px (no horizontal overflow in en / hi / te, browser-tested); two columns from 768 px (list + profile) |
| More dense than the learner app | Smaller type (16–18 px body), more blocks per screen, but the same component vocabulary |

## 4. Languages

- **Coach View language:** English, Hindi or Telugu, chosen by the coordinator. It is stored separately from every learner's language.
- **Learner-facing content in a session:** defaults to her preferred language and can be switched per session. Neither switch writes to her record.
- **Preview languages** (বাংলা · অসমীয়া · தமிழ்): shown behind "+" as dashed "Coming soon" chips. Tapping one explains that Coach View works in English, Hindi and Telugu. It never changes the language.
- **Translation status:** all Hindi and Telugu Coach View text and playbook text are **developer drafts**. They are flagged W39–W42 in `tests/evals/results/wording-review.csv` for native review.

## 5. AI: where it is and is not used

| Part | Deterministic or AI |
|---|---|
| Status, level, misconceptions, recommended lesson, evidence, reason, priority, follow-up rule | **Deterministic rules** (COACHING_LOGIC.md) |
| Coaching action / activity / question | **Approved playbook** text filled with her alias, business words and item-bank amounts |
| "Simpler words (AI)" | **Optional.** Sends ONE playbook sentence (no history, no evidence) to `/api/coach-wording`; the reply is validated (same amounts, her name kept, right script, no loans / investment / products / personal data, ≤ source length + 20) on the server and again in the browser. Any failure shows the approved wording. **No API key is configured in the demo, so it always falls back** (tested with a mocked Claude server only) |

## 6. Data and privacy

| Point | Detail |
|---|---|
| Storage | Everything is written as **append-only events in each learner's own record** (`ProgressRepository`, localStorage in the prototype). Coach actions add events; they never edit or delete earlier ones, so an override never removes diagnostic evidence |
| Separate records | One record per learner; a coach action targets exactly one learner ID (tested) |
| Learner app vs Coach View | The learner app never shows another learner and has no link to Coach View. Coach View is reached by press-and-hold on the ₹ logo or `#/coach` |
| No sign-in | This is **not access control**. A real deployment needs coordinator sign-in, role-based access and consent (PRD P0-2; PROGRESS.md) |
| Reset | "Reset demo data" asks for confirmation; Cancel keeps everything |
| What is not collected | Real names, phone numbers, addresses, bank details, income or sales records. Demo learners are fictional and labelled as such on every profile |

## 7. Offline and sync

- The whole coaching workflow runs on the device and works offline:
  - home, profile, "Why this lesson?"
  - session steps
  - check-ins, notes, level changes
- The service worker caches the app shell. Browser-tested with the network cut: Coach View reloads offline and saves a note and a check-in.
- **There is no sync.** Data stays on the phone where it was entered. The header and banner say so.
- Two coordinators on two phones will not see each other's changes. Clearing the browser data deletes the records.
- The repository interface is ready for a sync adapter (append-only events merge cleanly), but **none is built**.

## 8. What is complete vs simulated

| Area | Status |
|---|---|
| Coach home, profile, why, overrides, levels, notes, weekly-activity follow-up, guided session, pause / resume | **Working in the prototype** on fictional data, unit- and browser-tested |
| Learner-facing audio in sessions | **Real browser speech engine**; whether a Hindi or Telugu voice exists depends on the phone. **Never tested with real speech or real learners** |
| AI simpler wording | **Built, off in the demo** (no key); verified only against a mocked API |
| Sync between devices, sign-in, roles, consent | **Not built** |
| Playbook content | **Product-team draft**; not reviewed by coordinators; Hindi and Telugu not native-reviewed |
| Lessons 2–5 | Not in the app; sessions say "teach it with the activity" honestly |

## 9. Next steps

1. **Coordinator walkthrough (5–8 coordinators, ~45 min).** Tasks:
   - find who needs help today
   - explain why Saraswathi got her lesson
   - run a 20-minute session with a colleague playing the learner
   - pause and resume it
   - change a lesson with a reason

   Measure task success, time, and which words they do not understand.
2. Coordinator review of every playbook entry and follow-up rule (do they match what they would say?).
3. Native review of W39–W42.
4. Coordinator sign-in, and sync design, before any real learner data.

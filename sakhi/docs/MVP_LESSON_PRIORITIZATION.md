# MVP lesson prioritisation

**Date:** 2026-11-01. **Basis:** CONTENT_VALIDATION.md (desk review only; not field-validated). **Implemented as:** `MVP_SEQUENCE` / `MVP_CORE` in `src/assessment/engine.ts`. These drive the recommendation order, the diagnostic's harder questions, and the topic order in *My learning*.

## Recommended MVP sequence

| Order | Topic | Class | Status in the app |
|---|---|---|---|
| **1** | 💰 Sales and profit | Strong MVP | ✅ Full lesson; easy + harder practice; 3 weekly tasks |
| **2** | 🧾 Everyday costs (incl. spoiled goods, transport, household vs business costs) | Strong MVP | Diagnostic + weekly task. **Lesson to be written next** |
| **3** | 👛 Two pockets: home money vs shop money (+ keep tomorrow's stock money) | Strong MVP | Diagnostic + 2 weekly tasks. Lesson to be written |
| 4 | 🤝 Customer credit (udhaar) | Good but later | Diagnostic only; flagged to the coach |
| 5 | 🪙 Saving a little daily | Needs redesign | Diagnostic only; flagged to the coach |

**MVP = topics 1–3.**

**Why this order:**
1. **Each builds on the previous one.** Profit = sales − costs (1). Which costs to count (2). Then where the remaining money goes (3).
2. **All three have a concrete action at the stall** that a coordinator can check in 2 minutes.
3. **They cover the PRD's three questions:**
   - Did I make money? (1, 2)
   - Where did it go? (2, 3)
   - What will I do differently? (weekly tasks)
4. **The two later topics are deferred:**
   - Credit needs social and behavioural design and risks drifting into bookkeeping.
   - Saving currently mixes in savings-product questions the app must not answer.

**What changed in the app because of this order:**
- **Recommendations** follow MVP order rather than "most severe first". A credit or saving misconception is still shown to the coach and listed in `alsoReview`.
- **The diagnostic's harder questions** are asked only for topics 1–3.
- **My learning** lists topics in this order: Sales and profit → Everyday costs → Two pockets → Customer credit → Saving.
- **Topic status:**
  - topics 2–3: "👩‍🏫 With coach" until their lessons exist
  - topics 4–5: "🔒 Later"

**Module numbering:** the old numbering (Module 1–5 in curriculum order) is no longer shown to learners. Internal module IDs (m1–m5) are unchanged, so stored progress keeps working.

## Content backlog (in order)

| Item | Why |
|---|---|
| 1. Native review of lesson 1 (hi / te) | It is the only lesson in the app |
| 2. Write the **Everyday costs** lesson | Same 9-step structure as lesson 1, business variants. Reuse the diagnostic scenario (stock + auto fare) and lesson 1's spoiled-goods practice |
| 3. Write the **Two pockets** lesson | Include "keep tomorrow's stock money" (from sav_a) |
| 4. Parallel foundational items (A2) | So a retake does not repeat questions (DIAGNOSTIC_STRATEGY.md §3) |
| 5. Co-design the credit lesson's action with coordinators | No bookkeeping |
| 6. Redesign the saving lesson | Habit-based; no products or institutions named |

Each new lesson must pass the CONTENT_VALIDATION.md framework, including field checks, before it is marked "approved" in `LESSON_CATALOG`.

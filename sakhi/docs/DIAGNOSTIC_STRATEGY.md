# Diagnostic strategy: two tiers

**Date:** 2026-11-01. **Status:** implemented and tested. Code: `src/assessment/engine.ts` (`TIER_GATE`, `scoreGate`, `intermediateItemsFor`, `recommend`, `tierFor`, `mainMisconceptions`), `AssessmentFlow.tsx`, `RecommendationScreen.tsx`. This updates ASSESSMENT.md §3–4.

**Not yet validated:**
- Whether the gate thresholds separate learners well.
- Whether the "foundational / applied" split matches real difficulty.

Both are design assumptions until field data exists (§7).

## 1. Audit of the previous diagnostic

| Previous behaviour | Problem |
|---|---|
| 5 questions, one per concept. Form A (simple) on the first attempt; form B (applied, with amounts) only on a retake | Every learner saw the same 5 easy questions. A capable learner was never asked an applied question in her first session, so the app could not tell "knows the idea" from "can use it with numbers" |
| Recommendation: the most severe gap first, then curriculum order (1 → 5) | Severity ranked customer credit and daily saving as high as sales/profit. These lessons are not in the app, so many first recommendations led to "with your coach" instead of a lesson she could do now |
| No learner level | Coach View showed 5 per-concept labels but no overall picture ("start with basics" vs "ready for harder") |
| Retake = parallel form B for everyone | A struggling learner was given harder questions on a retake |

The item bank already had the right structure. The 10 items are 5 pairs, and each pair has a recognition question (A) and an application question with numbers or a decision (B). The redesign makes that structure explicit as **two tiers**.

## 2. The two tiers

| Tier | Items | What a correct answer shows | Example (vegetable stall) |
|---|---|---|---|
| **Foundational** (form A) | rvp_a, exp_a, crd_a, sep_a, sav_a | She recognises the idea | "You sold ₹500 and spent ₹300. Is your profit ₹500?" (Yes / No) |
| **Intermediate / applied** (form B) | rvp_b, exp_b, crd_b, sep_b, sav_b | She can use it with numbers or in a decision | "You sold ₹1,000. The goods cost ₹700. How much profit?" (₹300 / ₹1,000 / ₹1,700) |

## 3. Flow (first diagnostic)

```
5 foundational questions (one per topic)
          │
          ▼
  Gate: ≥ 4 of 5 right  AND  "sales and profit" right?
     │ no                                  │ yes
     ▼                                     ▼
  STOP (5 questions)                ⭐ "Well done! 3 more questions — a little harder."
  level = foundational              harder questions ONLY for the MVP-core topics she got right
                                    (sales & profit → everyday costs → two pockets), max 3
                                    level = intermediate
                                    (≤ 8 questions in total)
```

**Why these rules (design assumptions):**
- **Sales and profit is the anchor.** Every other money skill builds on "what is left after costs". A learner who counts all sales as profit is foundational, whatever else she knows.
- **4 of 5 right:** one slip or "not sure" is allowed. Two misses mean the basics need work, and harder questions would only add strain. Only the first 5 questions are shown up front ("5 short questions, no marks").
- **Harder questions only for topics she got right, and only for the 3 MVP-core topics:** they confirm she can *apply* the idea where we can teach it in the app. Asking about a topic she just got wrong would be redundant. The cap keeps the diagnostic within the PRD's 6–8 questions.
- **No third tier.** "Advanced" would need more items and more time. It is not justified for an MVP.

**Retake ("Answer new questions"):**
- After an **intermediate** result she re-checks with the 5 applied questions.
- After a **foundational** result she gets the staged diagnostic again.

**Known limitation:** a foundational retake repeats the same 5 foundational questions. She has seen their explanations, so a second correct answer is weaker evidence. Parallel foundational items (A2) are needed.

## 4. What the system identifies for each learner

| Output | Rule | Where it is shown |
|---|---|---|
| **Current level** | Staged: gate passed → intermediate, else foundational. Applied retake: ≥ 3 of 5 right → intermediate | Result screen ("🌱 Starting with the basics" / "🌿 Ready for harder questions"); Coach View ("Diagnostic level") |
| **Main misconception(s)** | Up to 2. Those seen on foundational questions first, then applied; MVP order, then severity | Coach View ("Main misconception: …"). Not shown to the learner as a label, because it could feel like a judgement; her lesson opens by naming it gently instead |
| **Recommended next lesson** | In MVP order (sales & profit → everyday costs → two pockets → credit → saving): (1) a foundational misconception → `misconception`; (2) "not sure" → `unsure`; (3) basics right but an applied question wrong → `applied_gap`; (4) a topic not asked → `not_assessed`; (5) otherwise the first lesson not yet completed → `next_in_path` | Result screen, Today, My learning, Coach View. All use the same rule, so they agree (tested) |

**Change from before:** the MVP order replaces "most severe first".
- **Reason:** recommend what she can learn **in the app now**, in a sensible sequence.
- **Result:** a credit or saving misconception is still flagged to the coach (`alsoReview`, Coach View). It only becomes the recommended lesson when there is no foundational gap earlier in the MVP order.

## 5. Personalisation after the diagnostic

| Learner | What she sees |
|---|---|
| Foundational, sales/profit gap | Lesson 1 opens with "your answers showed you counted all sales as profit". Practice starts with the **easy** two-number question, then a harder one |
| Intermediate, all core topics right | The result says "Ready for harder questions". Practice goes straight to the harder question once she has practised. Next: the next MVP topic (with the coach until its lesson is written) |
| Intermediate with an applied gap (e.g. forgot transport in the stock cost) | Recommendation "You know the basics. This lesson helps you use them in real life." → Everyday costs |
| Any learner with a credit or saving misconception | Flagged for the coach; becomes the recommendation only if no earlier MVP gap exists |

## 6. Verification

Unit tests in `src/assessment/__tests__/engine.test.ts` ("two-tier diagnostic", 7 tests):
- gate passed / failed (incl. the anchor rule)
- 3 of 5 right
- applied gap
- foundational gap outranks applied gap
- ≤ 8 questions

Other tests:
- `AssessmentFlow.test.tsx`: the "well done" screen, question 6 of 8, the level on the result, an applied retake, and stopping at 5.
- `progress/__tests__/engine.test.ts`: Today and Coach View recommend the same lesson as the diagnostic.

Browser check (`tests/e2e/primary-journey.cjs`):
- Telugu learner who is wrong on sales/profit → foundational after 5 questions.
- Hindi learner who is wrong only on credit → ⭐ unlock, 3 harder questions, intermediate level, credit recommended.

Evaluation datasets: 6 cases changed their expected *next action*, because the diagnostic now continues instead of ending:
- main set: SAV-EN-01, SAV-HI-01, SAV-TE-01 (dataset v1.4)
- held-out sets: SAV-HI-41, SAV-HI-51, SAV-HI-61

This is a product change. No expected correctness or classification changed.

## 7. What still needs real-user validation

1. **Gate calibration.** Does "4 of 5 + anchor" put learners in the tier a coordinator would choose? Ask coordinators to place 20 learners blind and compare.
2. **Item difficulty.** Is each B item actually harder than its A item for this population? Check per-item correct rates from pilot data (A should be > B).
3. **Burden.** Time to complete 5 vs 8 questions on real phones, and drop-off at the ⭐ screen.
4. **Retake evidence.** Write parallel foundational items before using retakes to claim progress.

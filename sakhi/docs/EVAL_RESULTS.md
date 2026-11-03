# Evaluation results

Latest run: 2026-10-30, after **multilingual round 2** (§M2). Earlier the same day: multilingual round 1 (§M) and the reliability round (§R).

**Commands** (all deterministic, no network):
- `npm run eval` (main set)
- `npm run eval:consistency` (en/hi/te equivalence)
- `npm run eval:holdout`, `eval:holdout2`, `eval:holdout3`, `eval:holdout4` (held-out probes)
- `npm run test:e2e` (9 browser suites against a running build)
- `npm test`

Raw reports are in `app/tests/evals/results/`. Method: `EVAL_PLAN.md`.

**All results below are on TEXT transcripts.** They are not voice-accuracy results: no real Hindi or Telugu audio has been tested (`SPEECH_VALIDATION.md`). All Hindi, Telugu and code-mixed inputs were written by the developer (an AI assistant) and have **not** been reviewed by native speakers (`MULTILINGUAL_REVIEW.md`).

**Did not run** (no credentials, reviewers or audio; nothing fabricated):

| Item | Status |
|---|---|
| Live Claude responses | Pending; needs `ANTHROPIC_API_KEY` + `--confirm` |
| LLM-as-a-judge rubric scores | Pending; same |
| Native-speaker review | Not done. 65 dataset inputs in `native-review.csv`, 31 wording flags in `wording-review.csv` and 276 consistency utterances, all unreviewed |
| Real-audio STT (browser or Sarvam) | Not done. Plan and 38-prompt sheet in `SPEECH_VALIDATION.md` / `tests/evals/audio/real-audio-test-sheet.csv` |

## L. Learning-model round (2026-11-01): effect on the evaluations

**Two-tier diagnostic (DIAGNOSTIC_STRATEGY.md):** when 4–5 of the 5 foundational answers are right (incl. sales/profit), the diagnostic now continues with up to 3 harder questions instead of ending. 6 cases changed their **expected next action** only; no expected correctness or classification changed:
- main dataset → v1.4: SAV-EN-01, SAV-HI-01, SAV-TE-01
- held-out sets: SAV-HI-41, SAV-HI-51, SAV-HI-61

**Results after the change:** 102/102 main, 322/322 consistency, held-out v1 21/22, v2 32/34, v3 36/36, v4 19/24. Unit and integration tests: 633/633. Browser suites: 9/9 (primary journey 55 checks).

## M2. Multilingual round 2 (2026-10-30)

This round repeated the multilingual task on the code from round 1 and the readiness audit. The curriculum, items, options, correct answers, scoring rules and lesson text were **not** changed.

**Order of work** (so the numbers are honest):
1. Wrote held-out **v3** (36 new utterances) and **11 new consistency groups** (77 utterances), before any code change.
2. Measured them.
3. Fixed what they exposed.
4. Wrote held-out **v4** (24 utterances) **after** the fixes and ran it **once, untuned**.

### M2.1 Measured results

| Measure | Before round 2 | After round 2 | Notes |
|---|---|---|---|
| **Held-out v3** (4 en, 16 hi, 16 te), untuned on the round-1 code | **30/36 (83.3%), 1 critical** | 36/36 (seen) | Round-1 code generalised better than round 0 (v2 untuned: 67.6%) |
| **Held-out v4** (3 en, 10 hi, 11 te), written after the fixes, run once **untuned** | — | **19/24 (79.2%), 0 critical** | **Best current estimate of generalisation.** By language: hi 7/10, te 10/11, en 2/3 |
| New consistency groups (10 on the **lesson** screens plus 1 hedged-uncertainty group) | 70/77, 1 critical | 77/77 | Development score |
| Whole consistency set (46 groups × 7 varieties = 322 utterances) | 315/322; equivalent scoring 42/46 groups | **322/322; 46/46** | Development score |
| Main dataset v1.3 (95 + 7 regression cases) | 95/102, 1 critical (on the round-1 code) | **102/102**, 0 critical | |
| Held-out v1 / v2 (seen) | 21/22, 32/34 | 21/22, 32/34 | No regressions |
| Unit + integration tests | 594 | **614** (27 files) | 15 of the 20 new round-2 tests fail on the round-1 code. The other 5 are guards against over-correcting, or already passed |
| Browser suites (`npm run test:e2e`) | 9/9 | **9/9** | The multilingual suite now also covers తెల్వదు, ఏం అన్నారు?, kya bola, फ़ायदा मतलब क्या (simulated microphone) |

**Round-2 baseline by variety** (new groups only): Telugu script, romanised and mixed all passed. Every failure was in English (3) or Hindi (4). Held-out v3 failures were split: Hindi 2, Telugu 3, English 1.

### M2.2 Failures found and fixed

| Finding | Severity | Fix |
|---|---|---|
| "I'm not too sure" (held-out v3 CRD-EN-51) was scored as the **correct answer "No"**: English "not" is a synonym of No | **Critical (false correct)** | Hedged English uncertainty: "not too / really / quite / a hundred percent sure / certain" is matched before answer matching. "No, it's not cash yet" and "not yet, she will pay tomorrow" are still "No" (tested) |
| Telangana "నాకు తెల్వదు" and spellings *teliyadhu, telidhu, telvadu* were not understood | Safe (asked again) | Added to the uncertainty patterns (pending native review) |
| "What did you say?" was read as unrelated: "kya bola aapne?", "आपने क्या कहा?", "ఏం అన్నారు?" | Safe | Repeat patterns for "what did you say" in en / hi / te (script and romanised) |
| "फ़ायदा मतलब क्या होता है?" (what does profit mean) was read as unrelated, because the app's word is मुनाफ़ा | Safe | Everyday profit and income words (फ़ायदा, नफ़ा, कमाई, आमदनी, ఆదాయం, సంపాదన, *fayda, nafa, kamai*) count as lesson vocabulary and concepts. **Wording flag W31:** which word should the lessons teach with? |
| "मुनाफ़ा घट गया" / "munafa ghat gaya" (profit went down) did not match the "down" option on the lesson check | Safe | Verb forms घट गया / घट गई / बढ़ गया added |

Main dataset v1.3 adds 7 regression cases: RVP-HI-25, RVP-HI-26, RVP-TE-22, RVP-TE-23, RVP-TE-24, CRD-EN-13, RVP-HI-28. No existing expected outcome was changed.

### M2.3 Held-out v4: remaining failures (kept untuned on purpose; all safe, nothing scored)

| Case | What happens | Possible fix (for the next round, with native review) |
|---|---|---|
| RVP-HI-62 "क्या पता, सोचना पड़ेगा" ("who knows, I'll have to think") | Read as unrelated (it contains क्या and no lesson word). Asks again; not scored | Treat "क्या पता" as uncertainty |
| RVP-HI-64 "bikri aur munafe mein kya farak hai?" ("what's the difference between sales and profit?") | Not understood. Asks again | Treat "difference between X and Y" as a concept question; add the oblique form *munafe* |
| SAV-HI-61 "na, kal ke maal ke liye chahiye" (No) | Short "na" is not a "No" synonym. Asks again | Add "na" as No, carefully: it is also a tag particle ("samjhao na") |
| RVP-TE-63 "sariga vinapadaledu" ("I didn't hear properly") | Not understood | Add vinapadaledu / వినపడలేదు spellings |
| RVP-EN-61 "sorry, I missed that" | Not understood | Add "missed that" to repeat requests |

**Pattern across four held-out sets:**

| Set | Untuned pass rate |
|---|---|
| v1 | 68% |
| v2 | 68% |
| v3 | 83% |
| v4 | 79% |

Each round fixes what it sees. New phrasings keep appearing at a rate of roughly 1 in 5. Hand-written keyword rules will not close this gap by themselves. Real learner utterances, consented and anonymised, are needed, and possibly a constrained AI interpreter whose output the learner confirms. A failure is still always safe: she is asked again or taps, and nothing is wrongly scored.

### M2.4 Speech (re-inspected; unchanged)

- Browser recognition and speech output are implemented. They are the live path on phones, but have never been tested with real audio.
- Sarvam is implemented but **not configured**: no `SARVAM_API_KEY`, and `/api/speech/status` → `configured:false`.
- Every voice test uses a simulated microphone and speaker.
- The real-audio plan and the 38-prompt sheet in `SPEECH_VALIDATION.md` still apply. Five round-2 prompts were added to the sheet. **No voice accuracy is claimed.**

## M. Multilingual round 1 (2026-10-30)

**Goal.** Improve understanding of Hindi, Telugu, romanised and code-mixed learner turns without changing the curriculum or any correct answer. No lesson text, item, option, correct answer or scoring rule was changed. All changes are in the layer that interprets the learner's words (intent, synonyms, number parsing, advice guard), plus two new UI messages.

### M1. Measured results

| Measure | Before (previous code) | After | Notes |
|---|---|---|---|
| **Language consistency**: 35 groups × 7 varieties = 245 utterances, written *before* any code change | **127/245 (51.8%)**, 7 critical. Excluding the new repeat/simplify distinction: 155/245 (63.3%) | **245/245**, 0 critical | Development score: the fixes were made with this set visible |
| Groups where every variety gets the **same result** | 20/35 | **35/35** | "Equivalent answers get equivalent scoring" |
| Groups where every variety is **correct** | 11/35 | **35/35** | |
| **Held-out v2**: 34 new utterances (4 en, 15 hi, 15 te), written after the changes, run **once untuned** | 21/34 (61.8%), **1 critical** | **23/34 (67.6%), 0 critical** | **Best estimate of generalisation.** Telugu was weakest: 8/15 vs Hindi 13/15 |
| Held-out v2 after fixing its systematic gaps (now seen) | — | 32/34 | Development score |
| Held-out v1 (22; seen in the previous round) | 16/22 | 21/22 | |
| Main dataset (v1.2: 85 + 10 new multilingual regression cases) | 85/95, 3 critical | **95/95**, 0 critical | The previous code fails exactly the 10 new cases |
| Script-loanword probe (13 utterances such as "रिपीट कीजिए", "ప్రాఫిట్ మూడు వందలు") | 11/13 (new code, before its fix) | 13/13 | |
| Unit + integration tests | 486 | **583** (24 files) | 53 of the 62 first multilingual tests failed on the previous code |

**Consistency by variety** (each out of 35). The "before" row excludes the new repeat/simplify mode check:

| | en | hi script | hi romanised | hi–en mixed | te script | te romanised | te–en mixed |
|---|---|---|---|---|---|---|---|
| Before | 26 | 25 | 22 | 20 | 23 | 20 | 19 |
| After | 35 | 35 | 35 | 35 | 35 | 35 | 35 |

**By intent category, before → after:**

| Category | Before | After |
|---|---|---|
| correct | 61/70 | 70/70 |
| incorrect | 31/35 | 35/35 |
| unsure | 23/35 | 35/35 |
| repeat | 28/35 recognised (0/35 with the new mode) | 35/35 |
| simpler explanation | 0/42 | 42/42 |
| unrelated | 12/28 | 28/28 |

### M2. Failures found and fixed

| Finding (baseline or held-out) | Severity | Fix |
|---|---|---|
| "मुझे नहीं पता", "pakka nahi pata", "sure nahi hoon" ("I don't know") were scored as the **correct answer "No"**, because they contain नहीं / nahi. 6 utterances, plus held-out v2 CRD-TE-43 "ఏమో అండి, గుర్తు లేదు" (contains లేదు) | **Critical (false correct)** | Multilingual uncertainty patterns (`phrases.ts`) checked **before** option matching. "नहीं, पता है…" ("No, I know…") is still "No" (tested) |
| "motham aaru vandala **yaabhai** rupayalu" was read as **₹600**: an unknown spelling of "fifty" was dropped | **Critical (wrong amount on a correct answer)** | More romanised Telugu number spellings. Also, when the Telugu connective "వందల / vandala" ends an amount and is followed by an unknown word, the amount is marked **low confidence**, so the app asks "Did you mean …?" rather than assuming a round hundred |
| No way to ask for a **simpler explanation**; concept questions ("what is a business expense?", "X అంటే ఏమిటి?") were "not understood" | Missing feature | New intent mode `clarification_request / simplify`. **Check screens:** re-read the question slowly (rate 0.7) and say that the check can't explain; "I'm not sure" is fine. Never scored, and gives no hint at the answer. **Lessons:** passed to the lesson explainer (Claude or approved fallback). Concept questions count only when no amount is said |
| Repeat requests in romanised / mixed / loanword forms ("dobara padh ke sunaiye", "once more cheppandi", "మళ్ళీ చదివి వినిపించండి", "one more time", "रिपीट कीजिए") | Safe (asked again) but unhelpful | Repeat patterns allow up to 2 words between "again" and the verb. Added romanised verbs, English "one more time" in Hindi or Telugu frames, and the script loanword रिपीट / రిపీట్ |
| Off-topic **commands** ("tell me a joke", "गाना सुनाओ", "ఒక కథ చెప్పండి") | Safe but unhelpful | Unrelated = no amount and no lesson words, phrased as a question **or a command**. A lone "एक / ఒక / one" is treated as an article, not as ₹1 |
| Meaning-level and polite forms: ఇంకా రాలేదు, అక్కర్లేదు → No; కాదండి / అవునండి; తగ్గిపోయింది → down; मिला देती हूँ / కలిపేస్తాను → mixed; వేరేగా, పక్కన పెట్టిన | Safe | Synonyms added (pending native review) |
| "twelve hundred, **not** fifteen hundred", "बारह सौ, पंद्रह सौ नहीं", "… కాదు" | Safe (asked which) | A negated amount is ruled out when exactly one other amount remains and no alternatives ("or / या / లేదా") were offered |
| Digits mixed with words, as speech recognisers write them: "साढ़े 6 सौ", "6.5 सौ", "6 వందల 50" | Safe (asked which) | Read as one amount. "साढ़े 600" and "सवा 200" are read as **low-confidence** ₹650 / ₹225 ("Did you mean …?") |
| "post office की स्कीम में डालूँ?" was classed as unrelated, not as savings-product advice | Not critical on the check screen (nothing is sent there); would have been passed to the lesson AI | Advice guard extended: post office, PPF, RD, NSC, "स्कीम में डालूँ / స్కీమ్ లో వేయాలా". **Bug caught by the existing test suite:** adding "SIP" made "a sip of tea" count as advice, so it was removed |

### M3. Tests added

- `src/speech/__tests__/multilingual.test.ts`: 91 tests, including over-correction guards ("what is the profit? three hundred" stays an answer; "I counted once more, three hundred" stays an answer).
- 3 UI tests in `voiceIntentUI.test.tsx`: simplify on a check screen (slow, no explanation, nothing selectable), simplify in a lesson, and "मुझे नहीं पता" → not sure.
- CI gate in `tests/evals/evals.test.ts`: the consistency set must cover every concept, variety and category, have 0 critical failures, and get the same result in every variety.
- Browser end-to-end check (simulated microphone, real app): `multilingual-e2e`, Telugu and Hindi assessment. Passed, and so did all 6 earlier browser suites.
- Main dataset v1.2: 10 regression cases (RVP-EN-24, EXP-EN-12, CRD-EN-11, CRD-TE-11, CRD-EN-12, RVP-HI-24, CRD-HI-12, SEP-TE-07, EXP-TE-11, RVP-TE-21). No existing expected outcome was changed.

### M4. Remaining differences and limitations

1. **Two held-out v2 failures remain, both safe** (the learner is asked again):
   - CRD-EN-41 "seven hundred, the two hundred is still pending": two amounts, so the app asks which. Choosing the only on-screen amount would risk guessing.
   - SAV-TE-41 "అన్నీ ఖర్చు పెట్టొచ్చు" ("I can spend it all" = Yes): needs meaning-level understanding that keyword rules do not provide. A future option is a constrained AI interpreter with confirmation.
2. **Held-out v1 RVP-TE-31** "1500 sales, profit 400" still asks which amount. That is safe.
3. **The development scores (100% consistency, 95/95) are optimistic**, because they were tuned on visible data. The untuned held-out v2 rate (**67.6%**, Telugu 53%) is the honest estimate, and is still based on developer-written text.
4. **Keyword rules have known risks:**
   - "ఏమో" is treated as "I don't know", even when said with an amount ("మూడు వందలు ఏమో"). The result is the "not sure" option, which is safe but may under-credit her.
   - "समझाओ" alone now means "explain".
   - English-script words in Hindi or Telugu frames are matched on all screens.

   Each needs native review.
5. **Equivalence holds for the 7 varieties tested.** It has not been tested for:
   - other spellings (e.g. *nahin / nai*, *teliyadhu*)
   - Urdu-influenced Hindi
   - Telangana vs coastal Telugu vocabulary
   - speech-recogniser output forms, which `SPEECH_VALIDATION.md` §2 says are mostly script, not romanised
6. **The lesson-wording issues are flagged, not fixed** (27 flags, 9 high priority). Changing approved copy without native review could introduce new errors.
7. **No voice accuracy is claimed.**

## R. Reliability round (2026-10-30, before the multilingual round)

### R1. Original vs new

| | Original run (2026-10-29), dataset v1.0 | After fixes (2026-10-30), dataset v1.1 |
|---|---|---|
| Cases | 75 | 85 (75 original + 10 regression cases) |
| Fully passed | 53 / 75 (70.7%) | **85 / 85 (100%)** |
| Passed, label pending live AI | 3 | 0 |
| Failed | 19 | **0** |
| Cases with critical failures | **5** | **0** |
| Unit + integration tests | 421 / 421 | **486 / 486** (23 files) |

**The same 75 original cases, three ways** (so the improvement is not an artefact of label changes):

| Version of the original 75 cases | Pass |
|---|---|
| Original results | 53 / 75 |
| New code, **original v1.0 file unchanged** (old label names, no new routes) | **68 / 75**, 0 critical |
| New code, v1.1 wording (only the label renames and the `replay` route below) | 75 / 75 |

In the unchanged v1.0 file, the 7 remaining "failures" are all naming or route differences:
- RVP-EN-09, CRD-HI-05 and SAV-HI-06 fail only because the old labels were `repeat_request` and `private_data`, where the code now says `clarification_request` and `sensitive_information`.
- RVP-HI-10, RVP-TE-11, CRD-EN-08 and SAV-TE-05 also fail on route: they now replay the question instead of showing the generic "no match" prompt.

**Dataset changes in v1.1** (documented, not used to hide failures):
1. Two labels renamed to the intent taxonomy requested for this round. The meaning of each case is unchanged.
   - `repeat_request` → `clarification_request` (5 cases)
   - `private_data` → `sensitive_information` (2 cases)
2. `replay` added as an acceptable route for 4 assessment repeat requests (RVP-HI-10, RVP-TE-11, CRD-EN-08, SAV-TE-05). The original results already recommended this as fix F4. The previous acceptable route (`no_match_prompt`) is still accepted.
3. 10 regression cases added (RVP-EN-21, RVP-HI-22, RVP-HI-23, CRD-TE-09, CRD-TE-10, EXP-EN-10, EXP-HI-11, SAV-TE-07, SAV-EN-08, SEP-TE-06). Some of them guard against over-correction: "मैंने फिर से गिना, दो सौ" ("I counted again, 200") must still be an answer.
4. No expected correctness, next action or critical condition of any original case was changed.

#### Main metrics, before → after (main dataset)

| Metric | Before (v1.0) | After (v1.1) |
|---|---|---|
| Financial calculation accuracy: reference table | 133/133 | 133/133 |
| Financial calculation accuracy: spoken amounts | 21/25 (84%) | **28/28 (100%)** |
| Correct-answer recall | 25/30 (83.3%) | **33/33 (100%)** |
| Correct-answer precision | 25/29 (86.2%) | **33/33 (100%)** |
| Misconception detection | 20/22 (90.9%) | **22/22 (100%)** |
| Classification overall | 53/72 (73.6%) | **85/85** |
| Routing | 61/75 (81.3%) | **85/85** |
| Lesson progression correctness | 64/75 (85.3%) | **85/85** |
| Response schema validity | 75/75 | 85/85 |
| Cross-language consistency: content sweep | 39/39 | 39/39 |
| Cross-language consistency: en/hi/te answer groups | 4/6 | **6/6** |
| Reference-free proxies (clarity, tone, grounding, script, length, corrective help) | 100% each | 100% each |

The reference-free proxies run on approved content only. They are **not** rubric scores.

**By language (after):**

| English | Hindi | Telugu |
|---|---|---|
| 32/32 | 28/28 | 25/25 |

Before, Hindi was the weakest at 15/25.

### R2. Critical failures: cause, regression test, fix

All regression tests are in `src/speech/__tests__/intent.test.ts` (58 tests) and `src/speech/__tests__/voiceIntentUI.test.tsx` (6 UI tests). Each was run and failed before its fix: the intent module did not exist, and the eval cases reproduced the bugs. The tests also record the old behaviour of the low-level matcher as the documented root cause.

| Case | Root cause | Fix (smallest reliable) | Status |
|---|---|---|---|
| **RVP-HI-10** "फिर से बताइए, समझ नहीं आया"; **CRD-EN-08** "I do not understand, please say it again" | Option matching looked for "नहीं"/"not" (synonyms of *No*) anywhere in the sentence, so a request was scored as the correct answer *No* | New deterministic **intent layer** `src/speech/intent.ts`, run on every answer screen *before* option matching. Clarification patterns are written as **requests** in en/hi/te + romanised, so "मैंने फिर से गिना, दो सौ" is still an answer. A clarification request produces no answer and no score; the question is re-read aloud. | Resolved; tests pass |
| **SAV-HI-06** "मेरा बैंक खाता नंबर 123456789012 है" | Assessment screens had no personal-data screening, and "बैंक" is a synonym of the correct answer "separately / bank account" | Sensitive-information check (`detectSensitiveInput`) first on every screen: ID-length numbers and credential words (OTP, PIN, account/card number, Aadhaar…). The transcript is cleared from the screen and never forwarded. Plain "bank account" is **not** sensitive, so "bank account lo separate ga" stays a valid answer (tested). | Resolved |
| **RVP-EN-06** "maybe 300, or maybe 1000" | The parser returned the first number | `parseSpokenAmounts` reads **all** amounts. Two different amounts → "I heard ₹300 / ₹1,000. Which one is your answer?" and no option is picked. The single exception is a clearly marked final result with no alternatives ("auto ka 40 add karke 440", "1000 minus 700 is 300"). | Resolved |
| **EXP-HI-03** "साढ़े छह सौ" proposed ₹600 (a wrong offered option) | "साढ़े" (+½) was not a known word, so only "छह सौ" was read | Hindi fraction modifiers साढ़े (+½), सवा (+¼), पौने (−¼) + romanisations, and Telugu "-న్నర" (+½) forms. Result: साढ़े छह सौ = 650, साढ़े चार सौ = 450, ఆరున్నర వందలు = 650. | Resolved |

**Other originally failing cases, now passing:**
- **F2** EXP-HI-05: working shown, then the result.
- **F3** CRD-HI-02 (साढ़े चार सौ) and EXP-EN-07: "six fifty" is now read as **low-confidence 650** and shown as "Did you mean ₹650?". If ₹650 is not a choice, the app asks again instead of guessing.
- **F4** RVP-TE-11, SAV-TE-05: repeat requests. EXP-HI-08, CRD-TE-07: unrelated questions get a short redirect back to the question.
- **F5** CRD-HI-05, CRD-EN-06, SAV-EN-04: the same sensitive and advice handling on assessments as on lessons.
- **F6** SEP-HI-03, SAV-HI-03, SAV-TE-03: romanised Hindi/Telugu and English loanword synonyms. These are **pending native review**.
- **F7** SEP-HI-05: gold, chit fund and lottery advice is now out of scope.

**Bugs found and fixed during this work:**
- **Regression caught by the existing suite.** My first version read only English + Telugu words on English screens. That broke "दो सौ" on an English screen (`voiceUI.test.tsx › retry listens again`). Fixed: English screens read Devanagari/Telugu *script* number words, but not romanised ones like "do" or "teen", which collide with English words.
- **New regression case EXP-HI-11** ("पंद्रह सौ और सौ मिलाकर सोलह सौ") initially failed and exposed two parser bugs: "और" joined 1500 and 100 into ₹1,50,000, and "मिलाकर" was not a result marker. Both are fixed and the case passes.
- **The first "which amount?" message echoed amounts that were not choices** (₹300 / ₹400 on a ₹370 question), failing the grounding proxy. It now lists only amounts that are on-screen choices; otherwise it says "I heard more than one amount…".

**Test edits:** one assertion was relaxed from exact equality to subset: `services.test.ts`, `matchSpokenAnswer('three hundred')` still must be `no_match / amount_not_offered`. The result now also carries the heard amounts, so the exact-equality check failed. **No other expected outcome was changed.**

### R3. Held-out probes v1 (generalisation check)

22 new utterances (8 en, 9 hi, 5 te), written **after** the fixes and run once **without tuning**: `tests/evals/dataset/holdout.v1.json`.

| Run | Fully passed | Critical |
|---|---|---|
| First run (untuned) | **15 / 22 (68.2%)** | **1** |
| After fixing only the critical one | **16 / 22 (72.7%)** | **0** |

**The critical one:** SAV-TE-31 "ఏ బ్యాంక్ మంచిది?" ("which bank is good?") matched the answer *bank account* and was proposed as correct. Fix: "which bank / scheme / app is best" questions are out-of-scope advice (en/hi/te), with regression tests. Because it was fixed after being seen, that case no longer counts as unseen.

**Remaining failures — all safe** (nothing is scored; the learner is asked again):

| Case | What happens | Recommended fix |
|---|---|---|
| RVP-EN-31 "Could you read the question one more time?" | Not recognised as a repeat request ("one more time" missing) | Add "one more time" / "एक बार और सुनाइए"-style variants; collect real phrasings from field audio |
| EXP-EN-31 "what is a business expense?" | A question *about the concept* is not recognised as a request for explanation | Classify "what is / क्या होता है / అంటే ఏమిటి + concept word" as a clarification request |
| CRD-EN-33 "tell me a joke" | Imperative off-topic requests are not detected as unrelated (only questions are) | Extend the unrelated detector to imperative requests without lesson words |
| CRD-TE-31 "ఇంకా రాలేదు" ("not received yet" = No) | No synonym for this meaning | Add meaning-level synonyms per question (native review) |
| CRD-EN-32 "twelve hundred, not fifteen hundred" | Treated as two amounts → asks which | Optional: handle "X, not Y". Asking is acceptable |
| RVP-TE-31 "1500 sales, profit 400" | Treated as two amounts → asks which | Optional: prefer the amount after the asked-about word (profit / लाभం / मुनाफ़ा). Asking is acceptable |

**Main-set vs held-out:** the main set now passes fully, but it was used to develop the fixes. **The held-out rate (72.7%, 0 critical) is the better estimate of real-world behaviour**, and it is still based on developer-written utterances.

### R4. Outstanding items at the end of the reliability round

1. Native-speaker review of all Hindi/Telugu synonym additions, number words (साढ़े/सवा/पौने, -న్నర) and the new intent messages. These are drafts, and so are all 53 non-English dataset inputs.
2. Live AI run and LLM-judge run when a key is available (`npm run eval:llm -- live|judge --confirm`).
3. Real-audio tests: real STT errors may differ from the invented misheard cases.
4. The 6 held-out gaps above. Then write a **new** held-out set, because this one has now been seen.
5. Field-sourced utterances (consented, anonymised) to replace developer-written cases.

**What changed in the app:**
- `src/speech/intent.ts` (new)
- `src/speech/numbers.ts` (rewritten parser)
- `src/speech/answerMatching.ts` (ambiguity, confidence, synonyms)
- `shared/aiGuards.mjs` (`detectSensitiveInput`, extended advice list; `screenLearnerText` uses it)
- `VoiceAnswer` (intent messages, re-reads the question, clears sensitive transcripts, forwards only safe non-answers to the lesson AI)
- Question text passed in from the assessment, lesson and practice screens
- New intent strings in en/hi/te (Hindi/Telugu drafts)

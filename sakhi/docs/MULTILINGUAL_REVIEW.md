# Multilingual wording review and native-speaker checklist

**Status (2026-10-30, updated after multilingual round 2):** No native speaker has reviewed any Hindi or Telugu text in this app. The flags below were raised by the developer, an AI assistant that is **not** a native speaker. They point to wording that **needs native-speaker review**. They are not verdicts that the wording is wrong, and nothing unflagged should be read as confirmed correct. No lesson wording was changed in this round, so the curriculum and correct answers are unchanged.

Files for reviewers (fill in the `REVIEW_*` columns):

| File | What it contains |
|---|---|
| `app/tests/evals/results/wording-review.csv` | 31 flagged items in lesson, assessment and UI copy (W28–W31 added in round 2) |
| `app/tests/evals/results/native-review.csv` | Every Hindi, Telugu and code-mixed **eval input** and the app's reply |
| `app/tests/evals/dataset/consistency.v1.json` | 276 Hindi and Telugu learner utterances (script, romanised, mixed) that the app is tested on, including 66 on the lesson screens (round 2) |
| `app/tests/evals/dataset/holdout.v3.json`, `holdout.v4.json` | 31 + 21 Hindi and Telugu probes, incl. Telangana (తెల్వదు, ఔను, malla) and Urdu-influenced (फ़ायदा, nai maloom) forms |
| `app/src/speech/phrases.ts`, `answerMatching.ts` (`OPTION_SYNONYMS`), `numbers.ts` | The phrases and number words the app recognises |

## 1. Wording flags (summary; details in `wording-review.csv`)

**High priority (meaning, learner-facing answer options, or inconsistent terms)**
- **W01** Telugu option "నిర్ణీత మొత్తం": a formal word on an answer option the learner hears.
- **W02** Telugu `intro.1.grocery`: a sentence with no verb ("అందులో కొంత డబ్బు అమ్మిన సరుకు ఖరీదు.").
- **W03** Telugu assessment "₹X విలువైన కూరగాయలు అమ్మారు": mirrors English "worth of", and differs from the lesson's "₹Xకి … అమ్మారు".
- **W04 / W05** The cost of goods sold has several words:
  - Hindi: लागत / कीमत / खर्च
  - Telugu: ఖర్చు / ఖరీదు

  One learner word per concept is needed.
- **W06 / W07** The weekly activity is called चुनौती / సవాలు on Home and Progress, but "इस हफ़्ते का काम" / "ఈ వారం పని" in the lesson.
- **W24 / W25** The new "simpler explanation" messages written this round.

**Medium**
- English glosses "(sales)/(profit)" are read aloud by Hindi and Telugu voices (W08).
- Stacked relative clauses in Hindi `intro.2` (W09).
- "सब्ज़ी की ₹60 की खरीदारी" (W10).
- The passive "बेचे गए सामान" (W11).
- The coach is feminine in one Hindi string and masculine in others (W12).
- Telugu "చిన్న ఆలోచన" vs Hindi "छोटी जाँच" (W13).
- Formal words: సందర్శన (W14), నిర్ధారించండి (W15), మీ మొదలు (W16), प्रगति / పురోగతి (W17, W18).
- Regional terms to check in the target district: అప్పు vs ఉద్దెర / బాకీ for customer credit (W20); गल्ला / గల్లా పెట్టె (W21).
- Unreviewed challenge text (W26).

**Low**
- सुरक्षित / సురక్షితం (W19).
- అంచనా వేస్తాను (W22).
- "सफ़र / ప్రయాణం" metaphor (W23).
- Feminine learner verbs in Hindi (W27). These match the target users; confirm they are wanted and consistent.

**Added in round 2:**
- **W28** "not in the app yet" screen.
- **W29** general practice hint.
- **W30** coach reason "on the right track".
- **W31 (decision needed): which word for profit.** The app teaches मुनाफ़ा, but learners in the probes said फ़ायदा / नफ़ा / कमाई. The recogniser now accepts all of them. Whether the *lessons* should use or gloss फ़ायदा is a native-speaker and NGO decision.

**Checked and consistent (no claim of correctness):**
- Hindi uses मुनाफ़ा for profit everywhere (लाभ appears 0 times).
- Telugu uses లాభం and అమ్మకాలు consistently. No mixed బిక్రీ/విక్రయం terms were found.

## 2. Phrases the app now recognises (developer-written; all need review)

| Area | Examples (Hindi / Telugu, script + romanised) | Where |
|---|---|---|
| Repeat requests | फिर से / दोबारा / एक बार और + बताइए / सुनाइए / पढ़कर…; रिपीट कीजिए; मళ్ళీ / ఇంకోసారి + చెప్పండి / వినిపించండి / చదివి / అడగండి; ఏమన్నారు?; *phir se batao, malli cheppandi, once more cheppandi* | `phrases.ts` REPEAT |
| Simpler explanation | आसान / सरल / सीधी भाषा में समझाइए; मुश्किल है, समझाओ ना; సులభంగా / సులువుగా / తేలికగా చెప్పండి; అర్థమయ్యేలా చెప్పండి; *simple ga explain cheyyandi* | SIMPLIFY |
| Concept questions | उधार क्या होता है?; X का मतलब क्या है?; X అంటే ఏమిటి?; *ante enti* | CONCEPT + MEANING |
| Uncertainty | मुझे नहीं पता; पक्का नहीं पता; मालूम नहीं; ఏమో; చెప్పలేను; ఐడియా లేదు; *idea nahi, idea ledu, sure ga teliyadu* | UNSURE |
| Off-topic commands | गाना सुनाओ; कहानी सुनाओ; ఒక కథ / పాట / జోక్ చెప్పండి | IMPERATIVE |
| Meaning-level answers | ఇంకా రాలేదు, అక్కర్లేదు → No; కాదండి / లేదండి / అవునండి; తగ్గిపోయింది → down; मिला देती हूँ / కలిపేస్తాను → mixed; వేరేగా → separately; పక్కన పెట్టిన → fixed amount | `OPTION_SYNONYMS` |
| Advice | post office / स्कीम में डालूँ / స్కీమ్ లో వేయాలా (savings products) | `shared/aiGuards.mjs` |
| Round 2 | Hedged English "not too / really sure"; Telangana తెల్వదు / *telvadu*; spellings *teliyadhu, telidhu, nai maloom*; "what did you say": आपने क्या कहा / *kya bola* / ఏం అన్నారు; everyday profit words फ़ायदा / नफ़ा / कमाई / ఆదాయం; घट गया / बढ़ गया | `phrases.ts`, `OPTION_SYNONYMS` |
| Amounts | romanised Telugu teens and tens (*pannendu, yaabhai…*); emphatic ఏడు వందలే / *edu vandale*; "पंद्रह सौ नहीं" / "పదిహేను వందలు కాదు" / "not fifteen hundred" negation; digits mixed with words (साढ़े 6 सौ, 6 వందల 50) | `numbers.ts` |

## 3. Native-speaker review checklist

**Reviewers:**
- At least 2 per language, preferably from the target districts.
- At least 1 who works with women microentrepreneurs, such as an NGO field coordinator.
- Record name (or ID), district and dialect in the CSV. A row counts as "reviewed" only with a named reviewer. The eval CI test rejects "reviewed" without one.

**For each lesson or assessment string (`wording-review.csv`, and a read-through of all learner copy):**
- [ ] Would a woman running a vegetable stall, tea stall or kirana shop understand it **when heard once**, without seeing it?
- [ ] Are there formal, Sanskritised or bookish words where an everyday word exists?
- [ ] Is it translation-ese (word order or passive constructions copied from English)?
- [ ] Is the same concept called the same thing on every screen (profit, sales, cost, udhaar or credit, cash box, weekly activity)?
- [ ] Is the tone respectful to an adult, not childish, and never shaming after a wrong answer?
- [ ] Is gender agreement correct and consistent (learner and coach)?
- [ ] When read aloud by the app voice, are amounts and words pronounced correctly (मुनाफ़ा, उधार, గల్లా, అప్పు, mandi)?
- [ ] **Meaning check:** does each translated question have the same correct answer as English? Pay special attention to yes/no questions, where a negative question can flip the answer.

**For the recognised phrases (section 2) and the consistency dataset:**
- [ ] Is each learner utterance something a real learner might say? Mark unnatural ones, and add the natural ways she would say the same thing.
- [ ] Is "क्या कहा / kya bola" ever used *inside an answer* rather than as "what did you say?" Is short "na" usable as "No" (held-out v4 SAV-HI-61), given it is also a tag particle ("samjhao na")?
- [ ] Are any recognised phrases **ambiguous**? For example, could "ఏమో" be a tentative answer rather than "I don't know"? Could "पक्का नहीं" mean something else in context?
- [ ] Are any common phrasings missing for: yes, no, not sure, say it again, explain more simply, what does X mean?
- [ ] Number words and spellings: romanised spellings learners actually type, and regional fraction words (साढ़े / सवा / पौने; -న్నర).

**Sign-off:**
- [ ] Every high-priority flag is resolved (changed, or kept with a reason).
- [ ] Changed copy goes through `npm run i18n:import`. Re-run `npm test`, `npm run eval`, `npm run eval:consistency`, and the holdout runs.
- [ ] The status in `EVAL_RESULTS.md` is updated with reviewer count and date.

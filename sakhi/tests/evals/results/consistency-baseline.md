# Language-consistency run — 2026-10-30T09:31:07.031Z

Dataset: hisaab-saathi-language-consistency v1.0: 35 groups × 7 language varieties = 245 utterances. Text transcripts only (no audio).

- Utterances with the expected result: **127/245 (51.8%)**
- Groups where all 7 varieties pass: **11/35 (31.4%)**
- Groups with equivalent scoring (same classification, correctness and option in every variety): **20/35 (57.1%)**
- Utterances with a critical failure: **7**

| Variety | en | hi | hi_rom | hi_mix | te | te_rom | te_mix |
|---|---|---|---|---|---|---|---|
| Pass | 22/35 (62.9%) | 20/35 (57.1%) | 18/35 (51.4%) | 16/35 (45.7%) | 19/35 (54.3%) | 16/35 (45.7%) | 16/35 (45.7%) |

**By category:** correct 61/70 (87.1%) · incorrect 31/35 (88.6%) · unsure 23/35 (65.7%) · repeat 0/35 (0%) · simplify 0/42 (0%) · unrelated 12/28 (42.9%)

## Critical

| Group | Variety | Utterance | Critical |
|---|---|---|---|
| rvp-unsure | hi | मुझे नहीं पता | FALSE_CORRECT |
| rvp-unsure | hi_rom | mujhe nahi pata | FALSE_CORRECT |
| rvp-unsure | hi_mix | mujhe sure nahi hai | FALSE_CORRECT |
| exp-correct-amount | te_rom | motham aaru vandala yaabhai rupayalu | WRONG_CORRECTNESS_ON_CORRECT |
| crd-unsure | hi | पक्का नहीं पता | FALSE_CORRECT |
| crd-unsure | hi_rom | pakka nahi pata | FALSE_CORRECT |
| crd-unsure | hi_mix | sure nahi hoon | FALSE_CORRECT |

## Failing utterances

| Group | Variety | Utterance | Got | Failed checks |
|---|---|---|---|---|
| rvp-unsure | hi | मुझे नहीं पता | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| rvp-unsure | hi_rom | mujhe nahi pata | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| rvp-unsure | hi_mix | mujhe sure nahi hai | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| rvp-repeat | en | Please say the question once more | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | hi | सवाल एक बार और बोलिए | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | hi_rom | sawal ek baar aur boliye | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | hi_mix | question repeat kariye | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | te | ప్రశ్న ఇంకోసారి చెప్పండి | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | te_rom | prashna inkosari cheppandi | clarification_request | clarify mode — ≠ repeat |
| rvp-repeat | te_mix | question malli repeat cheyyandi | clarification_request | clarify mode — ≠ repeat |
| rvp-simplify | en | Can you explain it in simpler words? | unrelated | classification unrelated ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | hi | थोड़ा आसान भाषा में समझाइए | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | hi_rom | thoda aasaan bhasha mein samjhaiye | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | hi_mix | simple words mein samjhao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | te | కొంచెం సులభంగా చెప్పండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | te_rom | konchem sulabhamga cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-simplify | te_mix | simple ga explain cheyyandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| rvp-unrelated | en | Play a film song for me | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | hi | मुझे एक गाना सुनाओ | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | hi_rom | mujhe ek gaana sunao | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | hi_mix | koi song play karo | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | te | ఒక పాట పాడండి | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | te_rom | oka paata paadandi | not_understood | classification not_understood ≠ unrelated |
| rvp-unrelated | te_mix | oka song play cheyyandi | not_understood | classification not_understood ≠ unrelated |
| exp-correct-amount | te_rom | motham aaru vandala yaabhai rupayalu | answer:stock_only | classification misconception_ignores_hidden_costs ≠ correct; correctness incorrect ≠ correct; option stock_only ≠ total |
| exp-unsure | hi_rom | maloom nahi | not_understood | classification not_understood ≠ unsure; correctness not_scored ≠ unsure; route no_match_prompt ∉ propose_confirm; option — ≠ unsure |
| exp-unsure | hi_mix | idea nahi hai | not_understood | classification not_understood ≠ unsure; correctness not_scored ≠ unsure; route no_match_prompt ∉ propose_confirm; option — ≠ unsure |
| exp-unsure | te_mix | idea ledu | not_understood | classification not_understood ≠ unsure; correctness not_scored ≠ unsure; route no_match_prompt ∉ propose_confirm; option — ≠ unsure |
| exp-repeat | en | Sorry, I didn't hear, please repeat | clarification_request | clarify mode — ≠ repeat |
| exp-repeat | hi | दोबारा पढ़कर सुनाइए | clarification_request | clarify mode — ≠ repeat |
| exp-repeat | hi_rom | dobara padh ke sunaiye | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| exp-repeat | hi_mix | ek baar phir se bolo please | clarification_request | clarify mode — ≠ repeat |
| exp-repeat | te | మళ్ళీ చదివి వినిపించండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| exp-repeat | te_rom | malli chadivi vinipinchandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| exp-repeat | te_mix | please malli cheppandi | clarification_request | clarify mode — ≠ repeat |
| exp-concept-question | en | What does business expense mean? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | hi | व्यापार का खर्च मतलब क्या होता है? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | hi_rom | vyapar ka kharcha matlab kya hota hai? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | hi_mix | business expense ka matlab kya hai? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | te | వ్యాపార ఖర్చు అంటే ఏమిటి? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | te_rom | vyapara kharchu ante emiti? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-concept-question | te_mix | business expense ante enti? | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | en | Explain it more simply please | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | hi | आसान करके बताइए | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | hi_rom | aasaan karke batao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | hi_mix | easy way mein batao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | te | ఇంకా సులువుగా చెప్పండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | te_rom | inka suluvuga cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-simplify | te_mix | easy ga cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| exp-unrelated | hi_mix | cricket match ka score batao | not_understood | classification not_understood ≠ unrelated |
| exp-unrelated | te_mix | cricket score cheppu | not_understood | classification not_understood ≠ unrelated |
| crd-correct-yesno | te | ఇంకా రాలేదు, రేపు ఇస్తారు | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ no |
| crd-correct-yesno | te_rom | inka raledu, repu istaru | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ no |
| crd-correct-yesno | te_mix | inka cash raledu, repu pay chestaru | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ no |
| crd-correct-amount | te | ఏడు వందలే | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ cash |
| crd-correct-amount | te_rom | edu vandale | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ cash |
| crd-unsure | hi | पक्का नहीं पता | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| crd-unsure | hi_rom | pakka nahi pata | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| crd-unsure | hi_mix | sure nahi hoon | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |
| crd-unsure | te_mix | sure ga cheppalenu | not_understood | classification not_understood ≠ unsure; correctness not_scored ≠ unsure; route no_match_prompt ∉ propose_confirm; option — ≠ unsure |
| crd-repeat | en | Say that again please | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | hi | एक बार फिर से बताइए | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | hi_rom | ek baar phir se batao | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | hi_mix | please phir se bolo | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | te | ఇంకొకసారి చెప్పండి | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | te_rom | inkokasari cheppandi | clarification_request | clarify mode — ≠ repeat |
| crd-repeat | te_mix | once more cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| crd-simplify | en | What is udhaar? Explain in easy words | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | hi | उधार क्या होता है, सीधे शब्दों में बताइए | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | hi_rom | udhaar kya hota hai, seedhe shabdon mein batao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | hi_mix | credit ka matlab simple mein batao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | te | అప్పు అంటే ఏమిటి, సులభంగా చెప్పండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | te_rom | appu ante emiti, sulabhamga cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| crd-simplify | te_mix | credit ante enti, simple ga cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-correct-choice | te_rom | inti kosam pakkana pettina dabbu nunchi | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ fixed |
| sep-unsure | hi_mix | mujhe idea nahi | answer:no | classification misconception_mixes_business_household ≠ unsure; correctness incorrect ≠ unsure; option no ≠ unsure |
| sep-unsure | te_mix | naaku idea ledu | answer:no | classification misconception_mixes_business_household ≠ unsure; correctness incorrect ≠ unsure; option no ≠ unsure |
| sep-repeat | en | Can you repeat that? | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | hi | फिर से सुनाइए | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | hi_rom | phir se sunaiye | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | hi_mix | ek baar aur repeat karo | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | te | మళ్ళీ వినిపించండి | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | te_rom | malli vinipinchandi | clarification_request | clarify mode — ≠ repeat |
| sep-repeat | te_mix | inkosari repeat cheyyandi | clarification_request | clarify mode — ≠ repeat |
| sep-simplify | en | Say it in a simpler way | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | hi | थोड़ा सरल करके समझाइए | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | hi_rom | thoda saral karke samjhaiye | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | hi_mix | isko simple tarike se samjhao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | te | కొంచెం తేలికగా వివరించండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | te_rom | konchem telikaga vivarinchandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sep-simplify | te_mix | konchem easy ga explain cheyyandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-correct-choice | te | పొదుపు డబ్బు వేరేగా దాచాలి | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ separate |
| sav-correct-choice | te_rom | podupu dabbu verega dachali | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route no_match_prompt ∉ propose_confirm; option — ≠ separate |
| sav-incorrect | hi_rom | dukaan ke paison mein hi mila deti hoon | not_understood | classification not_understood ≠ misconception_savings_mixed_with_cash; correctness not_scored ≠ incorrect; route no_match_prompt ∉ propose_confirm; option — ≠ mixed |
| sav-incorrect | hi_mix | shop cash ke saath mix kar deti hoon | not_understood | classification not_understood ≠ misconception_savings_mixed_with_cash; correctness not_scored ≠ incorrect; route no_match_prompt ∉ propose_confirm; option — ≠ mixed |
| sav-incorrect | te_rom | dukanam dabbutho kalipestanu | not_understood | classification not_understood ≠ misconception_savings_mixed_with_cash; correctness not_scored ≠ incorrect; route no_match_prompt ∉ propose_confirm; option — ≠ mixed |
| sav-incorrect | te_mix | shop cash tho mix chestanu | not_understood | classification not_understood ≠ misconception_savings_mixed_with_cash; correctness not_scored ≠ incorrect; route no_match_prompt ∉ propose_confirm; option — ≠ mixed |
| sav-repeat | en | One more time please | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| sav-repeat | hi | एक बार और सुनाइए | clarification_request | clarify mode — ≠ repeat |
| sav-repeat | hi_rom | ek baar aur sunaiye | clarification_request | clarify mode — ≠ repeat |
| sav-repeat | hi_mix | one more time boliye | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| sav-repeat | te | ఇంకోసారి చెప్పండి | clarification_request | clarify mode — ≠ repeat |
| sav-repeat | te_rom | inkosari cheppandi | clarification_request | clarify mode — ≠ repeat |
| sav-repeat | te_mix | one more time cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ repeat |
| sav-simplify | en | Explain in simple words | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | hi | सीधी भाषा में बताइए | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | hi_rom | seedhi bhasha mein batao | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | hi_mix | simple language mein bataiye | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | te | సాధారణ మాటల్లో చెప్పండి | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | te_rom | sadharana matallo cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-simplify | te_mix | simple words lo cheppandi | not_understood | classification not_understood ≠ clarification_request; route no_match_prompt ∉ replay; clarify mode — ≠ simplify |
| sav-unrelated | en | Tell me a story | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | hi | एक कहानी सुनाओ | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | hi_rom | ek kahani sunao | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | hi_mix | koi story sunao | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | te | ఒక కథ చెప్పండి | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | te_rom | oka katha cheppandi | not_understood | classification not_understood ≠ unrelated |
| sav-unrelated | te_mix | oka story cheppandi | not_understood | classification not_understood ≠ unrelated |

# Language-consistency run — 2026-10-31T00:04:41.141Z

Dataset: hisaab-saathi-language-consistency v1.1: 46 groups × 7 language varieties = 322 utterances. Text transcripts only (no audio).

- Utterances with the expected result: **315/322 (97.8%)**
- Groups where all 7 varieties pass: **42/46 (91.3%)**
- Groups with equivalent scoring (same classification, correctness and option in every variety): **42/46 (91.3%)**
- Utterances with a critical failure: **1**

| Variety | en | hi | hi_rom | hi_mix | te | te_rom | te_mix |
|---|---|---|---|---|---|---|---|
| Pass | 43/46 (93.5%) | 44/46 (95.7%) | 44/46 (95.7%) | 46/46 (100%) | 46/46 (100%) | 46/46 (100%) | 46/46 (100%) |

**By category:** correct 89/91 (97.8%) · incorrect 56/56 (100%) · unsure 47/49 (95.9%) · repeat 39/42 (92.9%) · simplify 49/49 (100%) · unrelated 35/35 (100%)

## Critical

| Group | Variety | Utterance | Critical |
|---|---|---|---|
| crd-unsure-hedged | en | I'm not too sure | FALSE_CORRECT |

## Failing utterances

| Group | Variety | Utterance | Got | Failed checks |
|---|---|---|---|---|
| lsn-check-correct | hi | मुनाफ़ा घट गया | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route ai_interpret ∉ propose_confirm; option — ≠ down |
| lsn-check-correct | hi_rom | munafa ghat gaya | not_understood | classification not_understood ≠ correct; correctness not_scored ≠ correct; route ai_interpret ∉ propose_confirm; option — ≠ down |
| lsn-check-unsure | en | not really sure | not_understood | classification not_understood ≠ unsure; correctness not_scored ≠ unsure; route ai_interpret ∉ propose_confirm; option — ≠ unsure |
| lsn-response-repeat | en | what did you say? | unrelated | classification unrelated ≠ clarification_request; clarify mode — ≠ repeat |
| lsn-response-repeat | hi | आपने क्या कहा? | unrelated | classification unrelated ≠ clarification_request; clarify mode — ≠ repeat |
| lsn-response-repeat | hi_rom | aapne kya kaha? | unrelated | classification unrelated ≠ clarification_request; clarify mode — ≠ repeat |
| crd-unsure-hedged | en | I'm not too sure | answer:no | classification correct ≠ unsure; correctness correct ≠ unsure; option no ≠ unsure |

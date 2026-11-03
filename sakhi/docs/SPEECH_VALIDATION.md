# Speech validation: what is real, what is simulated, and the real-audio test plan

**Status (2026-10-30, re-inspected after multilingual round 2: unchanged):** No real Hindi or Telugu audio has ever been recognised or measured for this app. Every multilingual accuracy figure in `EVAL_RESULTS.md` comes from **text transcripts** typed by the developer. Those figures say nothing about voice accuracy. This document separates the speech features that are built from the ones that were only simulated, and sets out the manual test that has to be done before anyone can claim voice accuracy.

## 1. Implemented vs simulated

| Part | What it is | Implemented? | Ever run with real speech? |
|---|---|---|---|
| **Browser recognition** (`src/speech/SpeechRecognitionService.ts`) | Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`). `lang` is set to exactly `en-IN`, `hi-IN` or `te-IN`; it never falls back to English. One utterance per tap, with interim results. | **Yes. This is the default live path on learners' phones.** On Android Chrome it is expected to use Google's online recogniser, so it needs a network connection. | **No.** The build environment's Chromium has no working recogniser: headless never starts, and headed under Xvfb returned `not-allowed` / `audio-capture`. Both correctly fell back to tap answers. |
| **Browser speech output** (`SpeechSynthesisService.ts`) | `speechSynthesis` with an en-IN / hi-IN / te-IN voice; slow rate 0.7; "no voice" notice when that language has no voice. | **Yes** | **No.** The test browser had 0 voices. |
| **Sarvam recognition** (`server/sarvam.mjs`, `SarvamServices.ts`) | Microphone → 16 kHz WAV → our backend `/api/speech/stt` → Sarvam `speech-to-text` (`saaras:v3`, mode `transcribe`; `codemix` can be set with `SARVAM_STT_MODE`). The key is held on the backend only. | **Yes, but not configured.** There is no `SARVAM_API_KEY`, and `api.sarvam.ai` was blocked by the build network. | **No.** Verified only against a **mock** Sarvam server, with a synthetic espeak-ng clip. |
| **Sarvam speech output** | Backend `/api/speech/tts` → `bulbul:v3` (speakers priya / neha / ishita). | **Yes, but not configured** | **No.** Mock only. |
| **Hybrid selection** (`HybridStt` / `HybridTts`) | Uses Sarvam when the backend reports `configured:true`; otherwise uses the browser. Failure → browser for that request. | **Yes** | The fallback paths were verified in a real browser, using mocks. |
| **Unit / UI test fakes** (`src/speech/__tests__/fakes.ts`) | `RecognitionHarness` / `SynthHarness` return a scripted transcript or voice list. | **Simulated** | n/a |
| **Browser end-to-end scripts** (speech-e2e, intent-e2e, multilingual-e2e) | Playwright injects a fake `SpeechRecognition` that "hears" a fixed string, and a fake `speechSynthesis` that records what was spoken and at what rate. | **Simulated microphone and speaker.** The rest of the app is real (screens, intent layer, scoring). | n/a |
| **Language-understanding layer** (`intent.ts`, `phrases.ts`, `answerMatching.ts`, `numbers.ts`) | Deterministic interpretation of the transcript. | **Yes** | Run on **text** only: 102 main cases, 116 held-out cases (v1–v4) and 322 consistency utterances. |

**What can be claimed today:**
- The app handles the given *transcripts* as described in `EVAL_RESULTS.md`.
- The voice UI works end to end with simulated engines.
- When real engines are missing, the app falls back to tap answers and shows the right notices.

**What cannot be claimed today:**
- Any word error rate.
- Any accuracy for spoken amounts or intents.
- Any performance in noise.
- Any dialect coverage.
- Any latency for real Hindi or Telugu speech, on either engine.

## 2. Why text results may not carry over to audio

1. **Script of the transcript.** Speech recognisers usually return Devanagari or Telugu script, and often write English loanwords in that script too ("रिपीट", "ప్రాఫిట్"). Romanised Hindi or Telugu ("pata nahi", "naaku idea ledu") will mostly come from **typed corrections** in the editable transcript box, not from the recogniser. Script loanwords are now handled for the probed words. Which forms each engine actually produces is still unknown.
2. **Number normalisation.** Sarvam `transcribe` mode and Chrome often return digits. A mixed output such as "साढ़े 600" is now read as a **low-confidence** ₹650, so the app asks "Did you mean ₹650?". The true rate of such outputs is unknown.
3. **Recognition errors are not modelled.** Misheard cases in the dataset were invented. Real errors (e.g. सात/साठ, ఏడు/ఎనిమిది, सौ dropped in noise) may differ.
4. **Short answers.** One-word answers ("नहीं", "లేదు") are the hardest for speech recognisers and the most common in the app.

## 3. Manual real-audio test plan (Hindi and Telugu)

**Prerequisites**
- A deployed build on HTTPS, since microphone access needs a secure origin.
- Optionally the backend with a Sarvam key. Run the test once per engine.
- **Consent:** each speaker agrees in writing to take part. Audio is **not recorded or stored by the app** (default). Testers write down only the transcript the app shows. Use only the fictional numbers on the sheet; **never a real phone, account or ID number.**

**Who:**
- At least 5 speakers per language. Include at least 2 women from the target user group (vegetable, tea or kirana sellers) and at least 1 older speaker.
- Record each speaker's region and dialect, e.g. Telangana vs coastal Andhra Telugu, or Hindi from Bhojpuri- or Awadhi-speaking areas. Report results **per group**.

**Devices:**
- At least 2 low-to-mid-range Android phones (Android 10+, Chrome), using the built-in microphone.
- Optionally 1 shared NGO phone.
- Note the network: 4G, 3G or Wi-Fi.

**Conditions:** every prompt in C1. Then, for each speaker, every prompt marked *critical* or *amount* in C2–C5.

| Code | Condition |
|---|---|
| C1 | Quiet room |
| C2 | Street or market noise, about 65–75 dB (check with a phone sound-meter app) |
| C3 | TV or radio in the background |
| C4 | Another person talking nearby |
| C5 | Phone held at arm's length or lying on the counter |
| C6 / C7 | Fast and slow speech, on the amount prompts only |

**Script:** `app/tests/evals/audio/real-audio-test-sheet.csv`. It has 43 prompts: 21 Hindi and 22 Telugu. Round 2 added a Telangana dialect prompt, "what did you say?" prompts and the फ़ायदा concept question. The sheet covers:
- plain, fractional, fused and emphatic amounts
- yes and no
- the **unsure-vs-No critical pair**
- repeat, simplify, concept questions
- code-mixing
- advice, sensitive and unrelated utterances
- ambiguity

**Procedure per prompt:**
1. Open the screen named in the sheet, in the speaker's language.
2. The speaker reads, or better *says in her own words*, the prompt. Note when she paraphrased.
3. Copy the transcript the app shows **exactly**.
4. Record what the app did: proposed option or amount, "Did you mean", which-amount question, re-read, redirect, or no-match.
5. Do **not** confirm a wrong proposal. Note it as a failure.
6. Note the latency from the end of speech to the transcript appearing (a stopwatch is enough).

**Measures:**
- **Transcript accuracy:** the transcript keeps the meaning (yes or no per prompt). Also note whether it was in native script or Latin, and whether amounts came as digits or words.
- **End-to-end correct behaviour:** the app did what the sheet expects.
- **Critical failures**, reported separately and individually:
  - a non-answer was scored or selected
  - a wrong amount or option was proposed as if it were what she said
  - an advice question or a number was not handled
  - "मुझे नहीं पता" / "idea ledu" turned into "No"
- **Recovery:** after a failure, could she complete the answer by tapping or by fixing the words?
- **Latency:** median and worst case per engine and network.

**Pass criteria for a field pilot** (to be agreed with the NGO; proposed):
- 0 critical failures in C1.
- End-to-end correct behaviour of at least 90% in C1 and at least 75% in C2–C4.
- Every failure recoverable by tapping.

These criteria are proposals, not results.

**Reporting:**
- Fill in the RESULT columns of the sheet.
- Add a section to `EVAL_RESULTS.md` with counts **per language, engine, condition and dialect group**, and the number of speakers.
- Do not merge in the text-only results.
- Add every real transcript that failed, anonymised, to the held-out text set as a regression case.

## 4. Quick checklist (per device × language × engine)

- [ ] The microphone permission prompt appears only after tapping the mic.
- [ ] Recognition language is the selected one (Hindi screen → Hindi transcript, never an English transcript).
- [ ] "तीन सौ" / "మూడు వందలు" → ₹300 is proposed; nothing is scored until she confirms.
- [ ] "साढ़े छह सौ" / "ఆరు వందల యాభై" → ₹650, or "Did you mean ₹650?". **Never ₹600.**
- [ ] "मुझे नहीं पता" / "पक्का नहीं पता" / "నాకు తెలియదు" / "నాకు తెల్వదు" → "not sure". **Never "No".**
- [ ] "फिर से बताइए" / "మళ్ళీ చెప్పండి" → the question is re-read and nothing is selected.
- [ ] "आसान भाषा में समझाइए" / "సులభంగా చెప్పండి" → the question is re-read **slowly** with the check-screen message (on a lesson, a simpler explanation is shown).
- [ ] "ఏ బ్యాంక్ మంచిది?" → advice redirect. **Never the "bank account" answer.**
- [ ] A fictional account or phone number → the transcript disappears and nothing is sent (check the network tab in a debug session).
- [ ] Market noise: a wrong transcript can be fixed by typing or by tapping the answer.
- [ ] Offline: the voice notice appears and tap answers work.
- [ ] Repeat the checklist on Sarvam (`transcribe`, then `codemix`) when a key is configured.

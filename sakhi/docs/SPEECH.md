# Speech: Speech-to-Text and Text-to-Speech

**Status:** Implemented with browser Web Speech APIs (`app/src/speech/`) · **Last updated:** 2026-10-28
**Companion to:** ARCHITECTURE §6 (voice pipeline), ASSESSMENT.md, LESSONS.md, **SARVAM.md** (server-side Sarvam STT/TTS, preferred when configured; this browser layer remains the fallback)

> **Summary of what was actually verified.** No real Hindi or Telugu speech engine was available in the build environment. The real browser tested (Chromium 153 on Linux) had **no TTS voices** and **no working speech recognition**, and the app correctly fell back to text and tap answers there. The complete voice flow was verified in that real browser with **simulated speech engines**, plus 82 automated tests. Real-device testing on Android Chrome in Hindi and Telugu is still required. See §8.

## 1. Architecture

```
React UI ─ SpeakControls / VoiceAnswer (components/speech)
    │
    ├─ useSpeaker / useListener / useVoiceInteraction  (speech/useVoiceInteraction.ts)  ← reusable hooks
    │        │
    │        ├─ SpeechSynthesisService   (wraps window.speechSynthesis)
    │        ├─ SpeechRecognitionService (wraps SpeechRecognition / webkitSpeechRecognition)
    │        ├─ answerMatching + numbers (deterministic transcript → option id)
    │        └─ languages.ts             (central config: en-IN / hi-IN / te-IN)
    │
    └─ Lesson engine & assessment engine: UNCHANGED. Voice only selects an option;
       scoring still goes through scoreAnswer() / the lesson machine.
```

- **Services** are plain TypeScript classes with an injectable `env`. They hold no React code and no lesson logic.
- **`SpeechProvider`** supplies one app-wide recogniser and one speech queue. Tests inject fakes here.
- **`StopSpeechOnNavigate`** sits inside the router and stops both speaking and listening whenever the screen changes.

## 2. Languages (`speech/languages.ts`)

| | English | हिन्दी | తెలుగు |
|---|---|---|---|
| BCP-47 (UI, STT, TTS) | en-IN | hi-IN | te-IN |
| Accepted voices | en-IN, en-GB, en-US, en | hi-IN, hi | te-IN, te |
| Font (bundled, offline) | Noto Sans | Noto Sans Devanagari | Noto Sans Telugu |
| Amounts spoken as | "1500 rupees" | "1500 रुपये" | "1500 రూపాయలు" |

- The language list on the onboarding screen, the language sheet and `<html lang>` all come from this file.
- The selected language is saved on the device (`localStorage`) and restored in the next session.
- Switching language during a lesson keeps the step and any selected answer. It stops speech in the old language and clears any half-captured voice answer.
- On-screen text is turned into speakable text before it is read aloud:
  - `₹1,500` becomes "1500 rupees" (or रुपये / రూపాయలు). Indian digit-grouping commas are removed so engines don't pause on them.
  - − + = become spoken words.
  - Long text is split into sentence-sized chunks, because Chrome cuts off long utterances.

## 3. Speech-to-text (`SpeechRecognitionService`, `VoiceAnswer`)

- **Microphone only on a button press.** `listen()` is called only from the mic button's click handler.
- **One utterance at a time** (`continuous = false`), with live partial words shown and up to 3 alternatives.
- **States shown to the learner:**
  - *requesting*: "Please allow the microphone…"
  - *listening*: "Listening… speak now", plus live partial words
  - *processing*: "Understanding…"
  - *result*: the words heard, in an editable box
  - *error*: a message for the specific problem (table below)
- **Show the words, then confirm.** The learner sees "We heard: …" in an editable box, plus "This matches: ₹200" or "These words don't match an answer". She can **fix the words**, **speak again**, or **confirm**. Confirming only selects the option; the screen's own *Check answer* button still submits it.
- **Never an English fallback.** `rec.lang` is exactly hi-IN or te-IN. If the engine rejects the language, the learner sees "Voice answers in Telugu aren't available here. Please tap your answer." The app never retries in English.
- **Tap answers are always on screen**, so voice is never required.

| Problem | Code | What the learner sees |
|---|---|---|
| No SpeechRecognition in the browser | `unsupported` | Tap-only notice, no mic button |
| Engine rejects hi-IN / te-IN | `language-unsupported` | Notice naming her language, no mic button |
| Microphone blocked | `permission-denied` | "The microphone is blocked. Tap your answer, or allow the microphone…" |
| No microphone | `audio-capture` | "No microphone found…" |
| Silence or timeout (12 s) | `no-speech` | "We didn't hear anything. Speak again or tap your answer." Mic stays available |
| Heard nothing usable | `no-match` | "We couldn't catch the words…" Mic stays available |
| Offline or service unreachable | `network` | "Voice answers need internet…" |
| Engine never starts (5 s) | `unknown` | "Voice isn't working right now…" |

**Matching spoken words to answers** (`answerMatching.ts`, `numbers.ts`) uses fixed rules, not AI:

- **Amounts:** digits, or number words in English, Hindi and Telugu, including romanised and mixed-language speech. Examples:
  - "five hundred", "fifteen hundred"
  - पाँच सौ, दो सौ पचास, डेढ़ हज़ार, ढाई सौ, "do sau"
  - ఐదు వందలు, ఐదొందలు, రెండు వందల యాభై, వెయ్యి ఐదు వందలు, "aidu vandalu"
- **Yes / no / not sure:** हाँ, नहीं, पता नहीं, అవును, లేదు, తెలియదు, haan, avunu… "Not sure" is checked first.
- **Text options:** exact label, or a short synonym list per option (e.g. घटा / कम / తగ్గింది mean "went down"). English loanwords are accepted ("profit", "stock").
- **Safety:** an amount that isn't one of the options, or words that match two options, give "no match". The matcher never guesses.

**Privacy:** the app never records or stores audio. Voice answers are saved as `source: 'voice'` only; the transcript is not stored. Browser recognition in Chrome typically sends audio to the browser vendor's online service, so it is **not assumed to work offline**: when the device is offline, voice is disabled and tap answers stay.

## 4. Text-to-speech (`SpeechSynthesisService`, `SpeakControls`)

- **Controls:** Listen/Replay, Pause, Resume, Stop, and **Slow** (rate 0.7 instead of 0.95; the choice is remembered on the device).
- **What can be read aloud:**
  - Language greetings
  - Business choice
  - Assessment intro, questions with options, and feedback
  - Recommendation
  - Every lesson step: starting point, explanation, example, question, feedback, challenge, completion
  - Home plan, lists, progress
- **No overlap:** one queue for the whole app. Starting any speech cancels the current one. Speech also stops on navigation, on language change, and when the mic starts.
- **Voice choice:** exact region first (hi-IN), then the language (hi), preferring voices on the device. Tag variants like `te_IN` are recognised.
- **No suitable voice:** a clear notice ("No Telugu voice on this phone. Please read the text, or ask your coach."). Nothing is spoken; Hindi or Telugu text is never read by an English voice.
- Voices load asynchronously in Chrome; the service waits for `voiceschanged` (up to 1.5 s) before deciding.

## 5. Regional language design

- The text is conversational and respectful. Hindi uses the आप form and feminine verb forms for the learner; Telugu uses the polite form.
- Financial terms use everyday words (मुनाफ़ा, उधार, గల్లా పెట్టె, అప్పు). The intro adds the English loanword in brackets, e.g. बिक्री (sales), లాభం (profit), because many learners use those words.
- Spoken text is the same short text shown on screen, kept under about 220 characters per block (enforced by a test).
- Amounts are always filled in from code. Translators never type numbers.

## 6. Editing translations (native-speaker review)

```
npm run i18n:export            # → translations/review.csv  (338 strings: UI, assessment, lesson; en | hi | te)
# reviewer edits the hi / te columns (Excel / Google Sheets, UTF-8)
npm run i18n:import translations/review.csv   # → src/i18n/translation-overrides.json, then rebuild
```

- The import rejects any change that would break the app: a different set of `{slots}` from English, a typed amount (₹ or digits), or an empty cell. Rejected rows are listed and the command exits with an error.
- Overrides apply everywhere text is shown **and** spoken.
- Spoken-answer synonyms (`OPTION_SYNONYMS` in `speech/answerMatching.ts`) and number words (`speech/numbers.ts`) are plain lists for reviewers to extend.

## 7. Tests (`npm test`: 247 passing in 10 files)

The new speech and translation tests are **85 in total**:

- **`speech/__tests__/services.test.ts` (65 tests)**
  - Language configuration and how amounts are read aloud.
  - 23 spoken-amount phrases in English, Hindi and Telugu, plus 4 phrases with no amount.
  - Option matching in all 3 languages.
  - Speech-to-text: unsupported browser; the right recognition language for each of the 3; permission granted and denied; silence, timeout and empty results; an engine that never starts; Telugu rejected with **no English retry**; offline; abort and busy.
  - Text-to-speech: voice choice and tag variants; missing voice means silence; unsupported browser; voices that load late; Hindi voice and amounts read as words; slow rate; no overlapping speech; pause, resume and stop; long text split into chunks.
- **`speech/__tests__/voiceUI.test.tsx` (17 tests)**
  - Selecting en, hi and te, and the choice surviving a new session.
  - Greetings use their own language's voice; a missing Telugu voice is shown as unavailable.
  - The mic starts only when pressed.
  - Permission granted and denied; unsupported browser; Telugu recognition unavailable (no English fallback).
  - Silence; words that match nothing; manual correction; speak again.
  - Hindi and Telugu amounts.
  - Read-aloud controls (replay, pause, resume, stop, slow); missing-voice notice.
  - **Navigating away cancels audio.**
  - A Telugu amount answering the lesson question by voice.
  - **Switching language mid-lesson** stops speech, keeps progress, and listens in the new language.
- **`i18n/__tests__/review.test.ts` (3 tests)**
  - CSV round trip.
  - Import validation.
  - Overrides applied to the UI, assessment and lesson text.
- **Existing tests:** all 162 still pass. The lesson logic is unchanged.

## 8. Language × browser verification matrix (what was actually run, 2026-10-28)

| Environment | Language | TTS | STT | Result |
|---|---|---|---|---|
| **Chromium 153 headless** (Linux container, real engines) | en, hi, te | **No voices installed** (0 voices) → app shows the "no voice" notice | Recognition exists but never starts → after 5 s the app shows "Voice isn't working right now. Please tap your answer." | Fallbacks verified ✓. Real speech **not** verified |
| **Chromium 153 headed** (Xvfb, no audio device, real engines) | en, hi, te | 0 voices (even with speech-dispatcher + espeak-ng installed and `--enable-speech-dispatcher`) → notice | Engine reported `not-allowed` with no audio device (an earlier probe reported `audio-capture`) → matching notice, tap answers | Fallbacks verified ✓. Real speech **not** verified |
| **Chromium 153 + simulated engines** (real browser, fake `speechSynthesis` / `SpeechRecognition` injected) | en, hi, te | Correct voice and tag (en-IN / hi-IN / te-IN); amounts read as rupee words; navigation cancels speech | Recognition language exactly en-IN / hi-IN / te-IN; wrong amount heard → corrected by typing → confirm → positive feedback; permission denied → notice; missing Telugu voice → notice, 0 utterances | UI integration verified ✓ (engines simulated) |
| jsdom unit/UI tests (fake engines) | en, hi, te | see §7 | see §7 | ✓ |
| **Android Chrome, desktop Chrome/Edge, Safari/iOS** | en, hi, te | **Not verified** | **Not verified** | To do on real devices |

**Not claimed:** working Hindi or Telugu recognition or playback on any real device. Expected behaviour still to be confirmed in the field:

- **Android Chrome:** hi-IN / te-IN recognition through Google's online service; Hindi voice usually installed, Telugu voice depends on the device and Google TTS language packs.
- **iOS Safari:** `webkitSpeechRecognition` behaviour differs; Telugu voices are often missing.
- **Firefox:** no SpeechRecognition, so tap only.

**Field checklist (per device, per language):**
1. Greeting plays in the right voice, or the "no voice" notice shows.
2. A lesson question is read aloud with amounts as "… rupees / रुपये / రూపాయలు".
3. Pause, resume, stop and slow all work.
4. The microphone permission prompt appears only after tapping the mic.
5. Saying "दो सौ" or "రెండు వందలు" matches ₹200.
6. Silence gives the "didn't hear" message.
7. Offline: the voice notice appears and tap answers still work.
8. Switching language mid-lesson stops audio.

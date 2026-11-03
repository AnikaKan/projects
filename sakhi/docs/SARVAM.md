# Sarvam AI Speech Integration

**Status:** Implemented. Wiring and fallbacks verified with a mock Sarvam; **real Sarvam calls not yet made** (see §7). · **Last updated:** 2026-10-28
**Companion to:** SPEECH.md (browser speech, fallbacks), ARCHITECTURE.md §6

> **Summary of what is verified.**
>
> - **Not verified:** Sarvam's actual recognition and voice quality. The build environment's network proxy blocks `api.sarvam.ai` (`CONNECT tunnel failed, 403`), and no API key was available.
> - **Verified in real Chromium:** the full pipeline (microphone → 16 kHz WAV → our backend → mock Sarvam → transcript confirmation → lesson answer, and backend TTS playback). Also verified: fallback to browser speech, tap answers, and the offline notice.
> - **Not done yet:** naturalness, pronunciation, dialect and latency results for real Sarvam. They need a live run with a key, plus native-speaker reviewers. Tools and templates for that are provided (§6).

---

## 1. Documentation review (docs.sarvam.ai, read 2026-10-28)

### Speech-to-text: `POST https://api.sarvam.ai/speech-to-text`

- **Request:** multipart form, header `api-subscription-key`.
- **Models:**
  - `saaras:v4` is the API default and recommended. Keyterm prompting (up to 50 terms) works only with v4.
  - `saaras:v3` is available.
  - Saarika appears in the docs only as "Deprecated". Saaras v2.5 sits on a separate translate endpoint and is due for deprecation.
- **`mode`:** `transcribe` (default), `translate`, `verbatim`, `translit`, `codemix`.
  - The API reference documents `mode` for **saaras:v3 only**. The model overview page describes it for v3 and v4. Because the docs disagree, we send `mode` only with v3.
- **Numbers:** `transcribe` mode applies **number normalisation (digits)**. `verbatim` keeps spoken words. `codemix` returns "English words in English and Indic words in native script".
- **`language_code`:** `en-IN`, `hi-IN`, `te-IN` (plus 20 other Indian languages, or `unknown` to auto-detect).
- **Limits:**
  - The sync REST endpoint takes **≤ 30 s** of audio. Longer audio needs the Batch API (up to 2 h) or WebSocket streaming.
  - 16 kHz recommended; "Prefer WAV (16-bit PCM)".
  - Formats listed include WAV, MP3, AAC, FLAC, OGG, OPUS and WebM. The REST guide lists fewer, so we always send WAV.
- **No latency figures are published.**

### Text-to-speech: `POST https://api.sarvam.ai/text-to-speech`

- **Request:** JSON, header `api-subscription-key`.
- **Models:**
  - `bulbul:v3` is stable and the API default.
  - `bulbul:v4-flash` is "recommended for new integrations". It has 200+ voices named `<name>_<lang>_<style>`, but **only 4 Telugu voices** (`kavitha_te_conversation`, `kavitha_te_narration`, `pooja_te_conversation`, `tarun_te_narration`).
  - `bulbul:v2` is legacy.
- **Languages for v3 (11):** includes `en-IN`, `hi-IN`, `te-IN`.
- **Parameters:**
  - `text` (≤ 2500 characters for v3; "Write numbers over four digits with commas (10,000)").
  - `language_code`, `model`, `speaker`.
  - `pace` (v3: 0.5–2.0).
  - `speech_sample_rate` (default 22050).
  - `output_audio_codec` (mp3, wav… but not opus for v3).
  - `temperature` and `dict_id` (pronunciation dictionary).
- **Response:** `{ audios: [base64] }`.
- **Limitations:**
  - **No SSML.** Pacing comes from `pace` and from splitting the text.
  - **Romanised Indic text lowers quality**, so we send native script.
  - "Not all speakers perform equally across all languages."
- **Speakers recommended in Sarvam's guide** (v3):
  - en-IN: ishita (F), ratan (M)
  - hi-IN: priya, suhani (F); shubh, ashutosh (M)
  - te-IN: neha, priya (F); shubh, ratan (M)

### Cost and limits (pay-as-you-go, excluding GST)

| Item | Pay-as-you-go | Notes |
|---|---|---|
| Speech-to-text | ₹0.49 per minute | Billed per second |
| TTS, Bulbul v3 | ₹3.00 per 1,000 characters | |
| TTS, Bulbul v4 Flash | ₹1.00 per 1,000 characters | |
| Free credits | ₹100 | Credits don't expire |
| Rate limit, STT REST | 60 requests per minute | |
| Rate limit, TTS REST | 60 requests per minute | |
| Error 402 | — | Credits exhausted |

### Data retention

- Retention is set per workspace, and data is **kept indefinitely until an Owner sets a retention period**.
- "No retention (0 days)" is supported for Model APIs. **Action:** before the pilot, the NGO's Sarvam workspace Owner should set Model APIs to 0 days.

## 2. Choices (all configurable on the server)

| Setting | Default | Why |
|---|---|---|
| STT model and mode | `saaras:v3`, `transcribe` | `transcribe` turns spoken amounts into digits, which suits rupee answers. `codemix` keeps English loanwords in Latin script; it is available via `SARVAM_STT_MODE=codemix` but not yet compared. v4 + keyterms (e.g. "udhaar", "mandi") is a candidate once tested |
| TTS model | `bulbul:v3` | Documented speaker recommendations for all three languages; v4-flash has only 4 Telugu voices |
| Speakers | en `ishita`, hi `priya`, te `neha` | Female voices that Sarvam recommends per language. Warmth and suitability for rural learners are **not yet judged by native speakers**; the Voice Lab lets reviewers compare alternatives |
| Pace | 0.9 normal, 0.7 slow | Within v3's 0.5–2.0; slightly slower than default for clarity |
| Amount formatting | `₹1500` → "1,500 रुपये"; operators as words with commas, e.g. "500 रुपये, घटा 300 रुपये, बराबर 200 रुपये" | Follows the "numbers over four digits with commas" guidance; commas create short pauses because SSML isn't supported |

## 3. Architecture

```
Browser (no keys)                         Our backend (server/, Node)                 Sarvam
──────────────────                        ───────────────────────────                 ──────
HybridTts ─ SarvamTtsService ─ SarvamClient ─► POST /api/speech/tts ─► synthesize() ─► /text-to-speech
   └─ fallback: browser SpeechSynthesis       (key from env, cache standard text)
HybridStt ─ SarvamSttService                 POST /api/speech/stt ─► transcribe() ─► /speech-to-text
   │  mic: getUserMedia → 16 kHz mono WAV     (metadata-only logs)
   └─ fallback: browser SpeechRecognition    GET  /api/speech/status (configured? never the key)
```

- **Keys and logging**
  - The key is read only from backend environment variables (`SARVAM_API_KEY`; see `.env.example`). `.env` is git-ignored.
  - A test checks that no frontend source file or built bundle contains the Sarvam host, the auth header or a key variable.
  - The backend logs only route, language, status, latency and byte counts. It never logs audio, text or transcripts (tested).
- **Speech-to-text**
  - The microphone opens only from the mic button.
  - Recording stops after 1.2 s of silence, 15 s maximum, or 6 s with no speech.
  - Audio is converted to 16 kHz mono 16-bit WAV in memory, uploaded once, then discarded.
  - The transcript appears in the existing editable confirm box; scoring is unchanged.
- **Text-to-speech**
  - Standard lesson text is cached:
    - on the server, opt-in per request;
    - in the browser's Cache Storage, for offline replay;
    - optionally as pre-generated files listed in `public/audio/manifest.json`.
  - Personal text (Home greeting with the learner's name, Progress summary) is marked `personal` and never cached.
  - Dynamic text is generated on demand.
- **Fallbacks**
  - **Backend not configured or unreachable:** browser speech is used; Sarvam is skipped for 60 s after a server-side failure.
  - **No browser voice either:** the "no voice" notice shows, and tap answers always remain.
  - **Offline:** a banner explains that voice answers are off and that saved lesson audio or the phone's voice may still play.
- **Dev-only Voice Lab** (`#/dev/voices`)
  - Routed only in `vite dev` builds or with `VITE_ENABLE_VOICE_LAB=1`; verified absent from the production bundle.
  - Uses identical scripts in en, hi and te: greeting, ₹500/₹300/₹200 example, ₹1,500/₹1,200, worked sum, code-mixed sentence, gentle correction.
  - Has Browser vs Sarvam play/slow buttons, speaker choice, and measured time-to-audio.
  - Has 1–5 rating fields and notes for reviewers, all **empty by default**.
  - Has a speech-to-text table (transcript, parsed amount, correct/incorrect, latency) and JSON export.

## 4. Running it

```bash
cp .env.example .env            # add SARVAM_API_KEY (backend only)
npm run server                  # speech backend on :8787
npm run dev                     # app on :5173, /api proxied → open #/dev/voices for the Voice Lab
npm run audio:pregen -- --dry-run                 # 219 clips · 30,927 chars · est. ₹92.78 (v3, excl. GST); --slow doubles it
npm run audio:pregen -- --confirm-license         # after confirming Sarvam's terms allow storing/shipping audio
npm run eval:sarvam             # live TTS/STT measurements → eval-output/report.json + mp3s for listening
npm run build && npm run serve  # production: one origin serving dist/ and /api
```

## 5. Tests (`npm test`: 297 passing in 13 files; 50 new)

- **`server/app.test.mjs` (15 tests, mocked Sarvam)**
  - The status endpoint never exposes the key; with no key the speech routes return 503 `not_configured`.
  - STT forwards exactly `file, model, mode, language_code` with `api-subscription-key`, and accepts en-IN, hi-IN and te-IN.
  - Unsupported languages, empty audio and oversized audio are rejected before calling Sarvam.
  - Upstream 403, 402, 429 and 5xx are mapped to stable codes.
  - **Logs contain no transcript, text or key.**
  - TTS sends the documented body and decodes base64 audio; pace, length and speaker allow-lists are enforced.
  - Cache: hit on the second request, and personal text is never written to disk.
- **`server/security.test.mjs` (3 tests):** no credentials in `src/` or `dist/`; `.env` is git-ignored.
- **`src/speech/__tests__/sarvam.test.ts` (32 tests)**
  - Amount formatting for Sarvam; WAV encoder (header, 16 kHz, mono, PCM16).
  - Client: request shape, offline cache, manifest, error codes, STT upload.
  - TTS service: playback, pause, stop, slow pace 0.7.
  - STT service: microphone errors; offline; empty transcript.
  - Hybrid fallbacks: no backend → browser; Sarvam failure → browser for the same request; preference handling; offline cached audio; STT falls back to the browser on the next press; "sarvam only" never falls back to English browser recognition.
  - 7 amount and code-mix transcript cases (synthetic strings).
- **All 247 earlier tests still pass.** Lesson and assessment logic are unchanged.

## 6. Evaluation

| Dimension | How it will be measured | Result |
|---|---|---|
| Voice naturalness | Native-speaker reviewers rate 1–5 in the Voice Lab, per script, language and engine (≥ 3 reviewers per language, including rural-dialect speakers if possible) | **Not yet measured** |
| Pronunciation accuracy | Reviewers rate 1–5; note mispronounced words (especially मुनाफ़ा, उधार, గల్లా, అప్పు, mandi) | **Not yet measured** |
| Financial numbers (TTS) | Reviewers mark each amount read "correct / partly / wrong" (₹200, ₹1,500, the worked sum) | **Not yet measured** |
| Financial numbers (STT) | Voice Lab STT table: real speakers say 5 amount prompts per language; parser result vs expected. Also `eval:sarvam` synthetic round trip (TTS → STT) as a lower bound only | **Not yet measured** |
| Code-switching | Code-mixed prompts ("मेरा profit दो सौ rupees है", "నా profit రెండు వందలు"); compare `transcribe` vs `codemix` modes | **Not yet measured** |
| Latency | Voice Lab: time-to-audio (TTS) and end-of-speech → transcript (STT) on real phones and networks; `eval:sarvam` from the server | **Not yet measured.** Mock-backend timings below are local only and say nothing about Sarvam |
| Dialects | Reviewers from different regions (e.g. Telangana vs coastal Andhra Telugu; Bhojpuri- or Awadhi-influenced Hindi). Results must be reported per group, not assumed equal | **Not yet measured** |

### What was actually run (2026-10-28)

| Environment | Engines | Result |
|---|---|---|
| Direct call to `api.sarvam.ai` from the build environment | Real Sarvam | **Blocked by the network proxy (403 CONNECT); no API key available** |
| Chromium 153 headless + our backend + **mock** Sarvam + fake mic (espeak-ng Hindi "दो सौ रुपये" + silence) | Our STT/TTS pipeline | ✓ Mic captured, silence detection stopped the recording, the backend received `RIFF`, 16000 Hz, mono, 2.69 s WAV, with `model=saaras:v3, mode=transcribe, language_code=hi-IN` and the key header. Transcript shown → matched ₹200 → confirmed → positive lesson feedback. TTS request: `bulbul:v3, speaker priya, pace 0.9, mp3, 22050`, with amounts as "500 रुपये"; audio played. The browser never contacted sarvam.ai |
| Same, Voice Lab (lab-enabled build) | Mock Sarvam vs browser | ✓ Page works. Sarvam(mock) row recorded a latency (local mock, not meaningful). Browser TTS: "no voice for this language" (no voices installed). Browser STT: "engine did not start" (headless) |
| Chromium 153 + backend **without key** | Fallback | ✓ Status `configured:false` → browser path. With no browser voice: "no voice" notice. Mic still offered via browser STT. Offline: banner in Telugu and voice answers turned off |
| Earlier suites (lesson pathways; browser-speech suite in headless, headed Xvfb and simulated-engine modes) | — | ✓ All passed again after the change |

## 7. Known limitations and risks

- **No real Sarvam output has been heard or measured.** Quality claims are deferred to the evaluation above.
- **Audio leaves the device:** with Sarvam, learners' voice answers are sent to our backend and on to Sarvam. They need an internet connection, consent wording in onboarding, and a 0-day retention setting in the Sarvam workspace (§1).
- **The 30 s sync limit** is fine for one-phrase answers; recording is capped at 15 s.
- **ScriptProcessorNode** is deprecated but has the widest support on low-end Android. An AudioWorklet version is a follow-up.
- **The docs disagree about `mode` on saaras:v4**, so we use v3 to stay within the API reference. Re-check before switching to v4 or keyterms.
- **Telugu has only 4 voices on v4-flash.** We use v3 so all three languages share one model.
- **Pre-generated or cached audio:** confirm Sarvam's terms before shipping files. The pre-generation script requires `--confirm-license`.
- **Cost:** a full lesson set is about ₹93 per voice/pace on v3 (≈ ₹31 on v4-flash), plus dynamic text per use. STT costs ₹0.49 per minute, and a typical answer is 3–5 s.

### Sources
- [Speech-to-text API reference](https://docs.sarvam.ai/api-reference-docs/speech-to-text/transcribe.md)
- [Saaras model page](https://docs.sarvam.ai/api-reference-docs/getting-started/models/saaras)
- [STT REST guide](https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/speech-to-text/rest-api)
- [Text-to-speech API reference](https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert.md)
- [Bulbul model page](https://docs.sarvam.ai/api-reference-docs/getting-started/models/bulbul.md)
- [Change the speaker voice](https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/text-to-speech/how-to/change-the-speaker-voice)
- [Voices catalogue](https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/voices#bulbul-v4-flash-voices)
- [Pricing](https://docs.sarvam.ai/api-reference-docs/pricing.md)
- [Credits & rate limits](https://docs.sarvam.ai/api-reference-docs/ratelimits.md)
- [Data retention](https://docs.sarvam.ai/api/platform/data-retention.md)

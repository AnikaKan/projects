# AI explanations (Anthropic Claude)

Status: implemented on 2026-10-28. Tested with mocked API responses and a local mock of the Messages API. **No live Claude output has been generated or reviewed yet**, because this environment has no API key (see §9).

## 1. What Claude does, and what it never does

Claude writes *wording*. The application decides everything else.

| Concern | Owner | Where |
|---|---|---|
| Lesson order, steps, retries, completion | **Deterministic**: lesson state machine | `src/learning/machine.ts` |
| Amounts and arithmetic (₹500 − ₹300 = ₹200) | **Deterministic**: integer calc engine | `src/learning/calc.ts` |
| Whether an answer is right, and which misconception it shows | **Deterministic**: option → outcome table | `src/learning/content/revenueVsProfit.ts` |
| Mapping a spoken answer to an option | **Deterministic**: synonym lists and number parser | `src/speech/answerMatching.ts`, `numbers.ts` |
| Assessment scoring and lesson recommendation | **Deterministic** | `src/assessment/engine.ts` |
| Which content and amounts the model may use at each stage | **Deterministic**: "lesson pack" built from approved content | `src/ai/pack.ts` → `server/explain/lesson-pack.json` |
| Whether a model reply may be shown | **Deterministic**: schema and guards | `server/explain/claude.mjs`, `shared/aiGuards.mjs` |
| Whether a suggested next action is allowed | **Deterministic**: state-machine guards (`canRetry`, `canAdvance`) | `src/ai/actions.ts` |
| A simpler, business-specific re-explanation of approved content | **Generative** (Claude) | `/api/explain`, mode `explain` |
| A reply to words that matched no answer (clarify, explain, or redirect) | **Generative** (Claude) | `/api/explain`, mode `interpret` |
| Encouragement after a correct answer or real effort | **Generative** (Claude) | `responseType: "encouragement"` |

Claude is never asked to compute an amount, score an answer, choose a lesson, or move the learner forward. Its `suggestedNextAction` is a hint. A button appears only if the state machine would accept that event anyway, and the button dispatches the normal event (`NEXT` / `RETRY`).

## 2. Where it appears in the app

- **"Explain another way"** (every lesson step except the completion screen, and except after a correct first answer). The machine first swaps in the next *approved* variant where one exists (intro, example, corrective feedback). Then Claude is asked for a personalised explanation, shown in a card labelled *"Explained for your stall"* with *"Written by AI from the approved lesson. Ask your coach if something is unclear."* The card has its own Listen control.
- **Unmatched spoken answer.** If the learner's words match no option, Claude's clarification appears below the answer panel. Nothing is selected or scored. The learner still taps or confirms an answer. Editing the recognised words does not send a new request.
- **Matched answers never call Claude.**

## 3. Request flow

```
Browser (no key)                        Backend (key in env)                       Anthropic
────────────────                        ────────────────────                       ─────────
learner words → screenLearnerText()  ── phone/ID/bank number → "please don't share" (never sent)
                                     ── loan/invest question → "ask your coach" (never sent)
GET /api/explain/status (once)       → configured? no → approved fallback, no POST
POST /api/explain {IDs only}         → zod request schema (.strict) + lesson-pack checks
                                       answer outcome looked up in the pack (client can't claim "correct")
                                       screen learner words again
                                       build lesson_context from the pack ───────► messages.create
                                                                                   claude-haiku-5-5
                                                                                   output_config.format = json_schema
                                                                                   effort low, thinking disabled
                                       stop_reason refusal/max_tokens → fallback ◄─
                                       JSON.parse → zod output schema → guards
                                       { ok:true, response } | { ok:false, reason }
re-check shape + guards in browser
show card  |  approved fallback
```

The browser sends **IDs and the learner's own words only**: `lessonId, lang, business, step, phase, mode, learnerAnswer {optionId?, text? ≤300}, misconceptions[], attempts`. The server looks up approved content and amounts itself. A modified client cannot inject its own "approved" text or numbers. Unknown fields such as a name are rejected with a 400.

## 4. Model input (built only on the server)

`lesson_context` contains:
- `conceptId`, `conceptName`
- `language`: for example "Telugu (te-IN). Write in Telugu script."
- `business`: a short description of a vegetable stall, tea stall or grocery shop
- `lessonStage`, `mode`, `questionOpen`
- `approvedContent`: the approved lesson strings for this stage, in the learner's language
- `validatedExample`: the calc engine's amounts, formatted as ₹
- `question`: stem and choices. `correctChoice` is included **only after** the learner answered.
- `attemptsLeft`
- `learnerAnswer {chosen, result, misunderstanding}`, taken from the pack
- `misunderstandingsSeen`

The learner's words go in a separate `<learner_words>` block. The system prompt treats that block as data, not instructions.

While a question is open, `validatedExample` contains only the amounts printed in the question (for example sales ₹500 and goods ₹300). It does not contain ₹200. Neither the model nor the guards can leak the answer that way.

## 5. Output contract

```json
{ "responseType": "explanation | clarification | encouragement | redirect",
  "spokenText": "string", "displayText": "string", "conceptId": "string",
  "requiresClarification": true, "suggestedNextAction": "continue | repeat | retry" }
```
- Requested with the API's structured-output mode (`output_config.format: json_schema`, `additionalProperties: false`, enums).
- Validated again at runtime with **zod** on the server (`.strict()`; displayText ≤ 420 chars, spokenText ≤ 600; trimmed and non-empty).
- Checked again in the browser (`checkShape` + guards) as defence in depth.

## 6. Guards (any failure → approved fallback)

| Guard | Rule | Reason code |
|---|---|---|
| Concept | `conceptId` must equal the lesson's concept | `guard:concept` |
| Consistency | `requiresClarification` ⇔ `responseType == clarification` | `guard:inconsistent` |
| Script | en: Latin only. hi: no Telugu, ≥ 50% Devanagari letters. te: no Devanagari, ≥ 50% Telugu letters. English words such as "sales" or "profit" are allowed inside Hindi and Telugu. | `guard:script` |
| Amounts | Every ₹ amount must be in the stage's validated set (Indian grouping, Devanagari and Telugu digits handled). Non-money counts 0–10 are allowed ("3 evenings"). | `guard:numbers` |
| Arithmetic | Any written `a − b … = c` must be true | `guard:arithmetic` |
| Number words | "five hundred", "पाँच सौ", "ఐదు వందలు" are refused, because they can't be checked | `guard:number_words` |
| Answer leak | While a question is open, the correct amount may appear only together with all other amount choices | `guard:reveals_answer` |
| Advice topics | Loans, borrowing, interest, investment, insurance, credit cards, EMI, etc. (en/hi/te + romanised) | `guard:topic` |
| Claims | "guaranteed", "double your …", "risk-free" | `guard:claim` |
| Personal data | Output that asks about OTP, PIN, Aadhaar, account or phone numbers | `guard:private` |
| API stop reasons | `refusal`, `max_tokens` | `refusal`, `truncated` |
| Parsing | Not JSON / schema mismatch | `invalid_json`, `schema_invalid` |

A test checks that **every approved string in every stage, language and business passes these same guards**. The guards therefore never reject the approved content that the model is supposed to paraphrase.

**Known limits (not caught deterministically):** a reply that keeps every number right but says something conceptually wrong in words, for example "profit went up" in the check question. Partial mitigations are in place: correctness is always decided and shown by the app, the model is told the result, and the reply is labelled as AI. A wrong-direction check for the up/down question, and native-speaker review of live samples, are next steps (§10).

## 7. Fallbacks (the demo works without credentials)

All fallback text is approved lesson content, editable through the translation review CSV.

| Situation | What the learner sees |
|---|---|
| No `ANTHROPIC_API_KEY`, offline, timeout (9 s server / 12 s browser), 429/5xx/529, auth error, refusal, invalid output, or a guard failed | **Explain another way:** the next approved variant (intro, example, corrective feedback) or the approved feedback. On an open question, the approved rule "Profit = Sales − all costs" (never the answer). **Unmatched words:** "I didn't fully understand. Please choose one of the answers below." |
| Learner asks about loans, investments, etc. | "I can't give advice on loans, savings or investments. Please ask your coach." The text is never sent to the model. |
| Learner says a phone, account or ID number | "Please don't share bank, phone or ID numbers here." The text never leaves the device. |

Without a key, `GET /api/explain/status` returns `configured:false` once, and the browser then answers every request locally. No POSTs are made and no 503s are logged.

## 8. Security and privacy

- `ANTHROPIC_API_KEY` exists only in backend env (`.env`, git-ignored; `.env.example` has it empty). The official SDK runs only in `server/`. The browser calls `/api/explain` only.
- The SDK would otherwise read `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` from the shell. The server passes `baseURL` (from our own `CLAUDE_API_BASE_URL`, default `https://api.anthropic.com`) and `authToken: null` explicitly.
- `server/security.test.mjs` fails if `src/`, `shared/` or the built `dist/` mention `api.anthropic.com`, `ANTHROPIC_API_KEY`, `x-api-key`, `sk-ant-`, `@anthropic-ai/sdk`, or `VITE_ANTHROPIC`.
- Logs are metadata only: route, lang, stage, mode, status, ms, source, reason, token counts, and guard detail such as "unapproved amount 250". A test checks that learner words and generated text are never logged.
- Per-client rate limit (`EXPLAIN_RATE_PER_MIN`, default 30/min) protects the budget. Request body ≤ 4 KB, learner text ≤ 300 chars.
- All lesson content and tests use fictional amounts and businesses.

## 9. Verification: what was actually run (2026-10-28)

| Check | Result |
|---|---|
| Docs reviewed | platform.claude.com: structured outputs (`output_config.format`, supported JSON-schema subset, `refusal`/`max_tokens` stop reasons), effort (`output_config.effort`; thinking can be disabled at ≤ high), Claude Haiku 5.5 model page (`claude-haiku-5-5`, $0.10 / $0.50 per MTok ≤100K, no `temperature`). SDK `@anthropic-ai/sdk@1.3.0` (latest on npm, published 2026-10-23). |
| Unit + integration tests | **381 / 381 pass** (18 files). 84 are new for this feature: server explain 43, guards 13, client/fallback/actions 16, lesson UI 8, pack 4. Typecheck clean, production build OK. |
| Requests built by the real SDK | Verified in tests with a fake `fetch`: `POST https://api.anthropic.com/v1/messages`, key sent (SDK 1.x uses `Authorization: Bearer`), `output_config.format.type = json_schema`, `effort: low`, `thinking: disabled`, no `temperature`. |
| Real API reachability | One request to the real API with a deliberately invalid key returned 401, which mapped to `upstream_auth` and then the approved fallback. This proves network path and error mapping only, **not** output quality. |
| Browser end-to-end (Chromium 153, prod build) | Through the real backend and SDK against a **local mock** of the Messages API (hand-written fixture replies). en/hi/te cards render. The permitted "continue" advanced the lesson. A fixture with wrong maths (₹500 − ₹300 = ₹250) was refused (`guard:numbers`), and the approved alternative showed. An unmatched answer produced a clarification without changing step or selecting an answer. Phone-number and loan questions were answered on-device, and the mock confirmed they never reached the upstream. |
| Without a key | Telugu lesson: approved variants and rule shown, one status request, no POST, no console errors. Existing lesson, speech and offline browser suites still pass. |
| Live Claude quality in Hindi/Telugu | **Not verified.** Needs a key: run `npm run eval:claude -- --confirm` (30 fictional cases, ≈ $0.01 at the listed Haiku 5.5 price). It writes `eval-output/claude-*-review.csv` with EMPTY reviewer columns for native speakers. No native-speaker feedback has been collected. |

Also fixed during this work: `ScreenShell` and `VoiceAnswer` called `useOnline()` conditionally (`demoOffline || !useOnline()`). Toggling demo-offline mode could crash React with a hook-order error. Both now call the hook unconditionally.

## 10. Configuration and next steps

`.env` (backend): `ANTHROPIC_API_KEY`. Optional: `CLAUDE_MODEL=claude-haiku-5-5`, `CLAUDE_EFFORT=low`, `CLAUDE_TIMEOUT_MS=9000`, `CLAUDE_MAX_RETRIES=0`, `CLAUDE_MAX_TOKENS=700`, `CLAUDE_API_BASE_URL=`, `EXPLAIN_RATE_PER_MIN=30`.
After editing lesson content or translations, run `npm run ai:pack`. A test fails if the server pack is stale.

Next:
1. Run the live eval with a key. Then have native speakers fill the review CSV (meaning matches lesson, natural for a seller). Track the guard-rejection rate per language. A high `guard:script` or `guard:numbers` rate means a prompt fix, not looser guards.
2. Add a direction check for the up/down comparison question.
3. Decide with the NGO whether AI cards are on by default or coach-enabled per learner, and whether Anthropic data-retention settings meet their policy.
4. Extend the pack to modules 2–5 as their lessons are written.

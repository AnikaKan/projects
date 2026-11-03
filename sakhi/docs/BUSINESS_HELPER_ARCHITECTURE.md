# Business Helper: architecture

**Date:** 2026-11-01.

**Branch:** `feature/demo-and-business-helper`. Commits:

| Commit | Content |
|---|---|
| `d742278` | Checkpoint before this work |
| `9b964fa` | Presentation demo |
| `82c13b9` | Business Helper |

## 1. Files

| File | Role |
|---|---|
| `src/helper/helperModel.ts` | **Pure, deterministic logic.** Tool list; request → tool routing (keyword rules, en / hi / te); Check My Price workflow (`PRICE_STEPS`, `checkPrice`); Understand My Money scenarios (`MONEY_QUESTIONS`, `checkMoneyAnswer`, `explainMoney`); amount limits; ₹ formatting |
| `src/helper/voice.tsx` | Reusable voice components: `Question` (picture, words, Listen / Slow, auto-read once); `BigMic` (listening / processing states, fallbacks); `AmountInput` (speak + read-back + keypad + confirm); `PictureCard`; `Notice` |
| `src/helper/screens.tsx` | `HelperHome`, `PriceTool`, `MoneyTool`, plus the result rows, lesson links and the coming-soon sheet |
| `src/i18n/helperStrings.ts` | `bh.*` and `nav.helper` strings, en / hi / te (type-checked: every key in all three) |
| `src/helper/__tests__/helper.test.tsx` | 14 unit / UI tests |
| `tests/e2e/helper-e2e.cjs` | 23 browser checks |
| `tests/e2e/fake-speech.cjs` | Simulated speech engines for browser tests (copied from `speech-e2e.cjs`) |

## 2. Existing files changed

| File | Change | Risk check |
|---|---|---|
| `src/AppRoutes.tsx` | `+ /helper`, `/helper/price`, `/helper/money` (and `/demo`) | All 12 browser suites pass |
| `src/components/ScreenShell.tsx` | Bottom nav: 2 → 3 items (`nav-helper`) | primary-journey updated to expect 3 tabs; 360 px overflow check in en / hi / te |
| `src/i18n/strings.ts` | Merge `HELPER_*` dictionaries | Translation-review round trip still passes |
| `tests/e2e/primary-journey.cjs` | Expects 3 tabs | — |
| `tests/e2e/run-all.cjs` | Adds `demo-e2e`, `helper-e2e` | — |

**Not changed:** the assessment engine, lessons, scoring, progress rules, Coach View, coaching logic and the `/demo` route.

## 3. Reused infrastructure

| Need | Reused |
|---|---|
| Speech to text | `useListener(lang)`: the app's STT service. Browser Web Speech API by default; Sarvam when the backend has a key (SARVAM.md). Language comes from the app language |
| Text to speech | `useSpeaker(lang)`, `SpeakControls` (Listen / Replay / Pause / Stop / 🐢 Slow; "no voice" notice). The speech layer reads ₹ amounts as words in each language |
| Spoken numbers | `parseSpokenAmounts` (digits and number words in en / hi / te; flags several / ambiguous amounts) |
| Spoken choice (item step) | `matchSpokenAnswer` |
| Lessons | Existing `/lessons/:moduleId` routes: m1 Sales and profit, m2 Everyday costs, m3 Customer credit, m5 Two pockets |
| Design | `ScreenShell` (header, language sheet with the preview languages, step bar, offline banner), Tailwind tokens, `MODULE_EMOJI` |

## 4. Workflow states

**Check My Price.** `item → cost → extra → price → result`.
- `nextPriceStep` / `PRICE_STEPS` are fixed.
- A correction from the result sets `returnTo='result'`, so after re-answering one step she lands back on the result.

**Understand My Money.** `pick → question[0..n-1] → result`.
- `checkMoneyAnswer` validates each answer against earlier ones.
- After a correction, any later answer that became impossible is re-asked first.

**Types:** `PriceInputs`, `PriceResult` (verdict `covers` / `breakEven` / `loss`, `noExtras`), `MoneyResult` (rows with kind `in` / `out` / `owed` / `result`, message key, vars, lesson).

**Arithmetic** is integer rupees in TypeScript. There is no floating point and no AI.

## 5. AI

**None is used.** The brief allowed AI only for intent detection, understanding answers, and wording verified results. All three are handled deterministically:

| Job | How |
|---|---|
| Intent | Keyword rules |
| Answers | The existing number parser and option matcher |
| Wording | Fixed localised templates filled with computed amounts |

So the tool works offline and with no API keys. If AI wording is added later, it should follow the Coach View pattern (`shared/coachWording.mjs`): the model sees only one approved sentence, and its output is validated (same amounts, no advice topics) with the approved text as fallback.

## 6. Data and privacy

| Point | Detail |
|---|---|
| Where amounts live | **React component state only.** They are lost when she leaves the screen |
| What is not written | Nothing goes to the learner record, `localStorage`, or the server. Tested: the store is byte-identical before and after a full money flow |
| Microphone audio | Handled by the browser or Sarvam exactly as elsewhere in the app. The app never stores audio |
| Amount limit | ₹1,00,000. Longer digit strings (phone or account numbers) are refused |
| Future opt-in practice outcomes (not built) | Store only `{tool, lessonLinkOpened, at}`, never amounts, behind an explicit consent switch, so the coach can see "used Check My Price, then practised Everyday costs" |

## 7. External dependencies

| Feature | Depends on |
|---|---|
| Speech recognition | The browser (Chrome / Edge send audio to the browser vendor's service and need internet), **or** the Sarvam backend if configured (`SARVAM_API_KEY` on the server; paid) |
| Read-aloud | The device's installed voices (or Sarvam TTS if configured) |
| Everything else | Nothing external: calculations, routing, screens, lesson links and offline use (service-worker app shell) |

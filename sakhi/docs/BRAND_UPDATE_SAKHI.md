# Brand update: Hisaab Saathi → Sakhi, Business Helper → Business

> Updated 2026-11-01: the name was briefly "Saakhi" and is now **Sakhi** (सखी / సఖి).

**Date:** 2026-11-01.

**Branch:** `feature/saakhi-ui-refinement`, which starts from the Business Helper work.

## 1. What changed for users

| Where | Before | After |
|---|---|---|
| App name in the header on every learner screen with the logo: onboarding, diagnostic, recommendation, Today, My Learning, Business, lesson-complete | Hisaab Saathi / हिसाब साथी / హిసాబ్ సాథీ | **Sakhi / सखी / సఖి** |
| Browser tab title | Hisaab Saathi — Wireframes | **Sakhi** |
| Coach View header | Hisaab Saathi · Coaching assistant | **Sakhi** · Coaching assistant |
| Presentation demo (`#/demo`) header | Hisaab Saathi | **Sakhi** |
| Wireframe gallery title | Hisaab Saathi — Clickable wireframes | Sakhi — Clickable wireframes |
| Third tab and the Business screen title | Business Helper / व्यापार मदद / వ్యాపార సహాయం | **Business / व्यापार / వ్యాపారం** |
| Second tab and the My Learning screen title (English) | My learning | **My Learning** (Title Case, to match "Today" and "Business") |

**Bottom navigation now reads: ☀️ Today · 🌱 My Learning · 🎙️ Business.** The microphone icon is kept.

Each label fits on one line at 360 px in English, Hindi (आज · मेरी सीख · व्यापार) and Telugu (ఈ రోజు · నా నేర్పు · వ్యాపారం). This is browser-tested.

The tool names are unchanged: Check My Price, Understand My Money, Customer Message, Understand a Loan.

## 2. What deliberately did NOT change

These internal names stay the same, so existing data and links keep working:

| Internal name | Why it stays |
|---|---|
| Routes (`#/helper`, `#/helper/price`, `#/helper/money`, `#/coach`, `#/demo`) | Old links keep working |
| Component and folder names (`src/helper/…`, `HelperHome`) and test ids (`nav-helper`, `bh-*`) | Renaming adds risk and changes nothing a user sees |
| Storage keys (`hisaab.progress.v1.*`, `hisaab.ui.v1`, `hisaab-shell-v1` service-worker cache) | Renaming would orphan every saved learner record on a device and invalidate the offline cache. Users never see these |
| The Hindi intent word "हिसाब" (accounts) in the Business tool's voice routing | It is an ordinary word learners may say ("मेरा हिसाब"), not the brand |
| Doc file names (`BUSINESS_HELPER_*.md`) | A rename note was added at the top of `BUSINESS_HELPER_DESIGN.md` instead |

## 3. Docs updated

| Doc | Change |
|---|---|
| `PRD.md` | Title, plus a name note (formerly "Hisaab Saathi") |
| `EVAL_PLAN.md` | Title |
| `UX_REDESIGN_NOTES.md` | Logo label |
| `BUSINESS_HELPER_DESIGN.md` | Rename note |
| `app/README.md` | Title |

Older audit and review docs still mention "Hisaab Saathi" where they describe what the app was called at the time.

## 4. Needs a decision or validation (not done)

- **Native-script spelling.** सखी (Hindi) and సఖి (Telugu) both mean "female friend / companion". Native speakers should confirm these spellings in context.
- **Same name as an existing app.** The orange inspiration screenshot was of a different app also called **"Sakhi"**, and "Sakhi" is a common name for women's programmes in India.
  - Before any public use, do a trademark / app-store search and decide whether a distinguishing word is needed (e.g. "Sakhi Hisaab").
  - Its branding and layout were not copied.
- **"व्यापार" / "వ్యాపారం" as a tab label** means "business / trade". Check with learners that it signals "tools for my shop" and is not read as a lesson topic.

## 5. Verified

| Check | Result |
|---|---|
| Unit test `components/__tests__/branding.test.ts` | Passes. The app name is Sakhi in en / hi / te; tabs read Today · My Learning · Business; **no user-facing string anywhere** still contains Hisaab Saathi or Business Helper, in any language |
| Browser (`helper-e2e`, +4 checks) | Passes. Header shows Sakhi; the Business screen title reads "Business"; tabs fit on one line; key controls are at least 44 px |
| Regression | All 12 browser suites pass (see UI_PROPORTION_REFINEMENT.md §6) |

# Business Helper: design

> **Renamed 2026-11-01:** the feature is now called **Business** in the app (tab and screen title: Business · व्यापार · వ్యాపారం). Code, routes (`#/helper`) and this file name keep "helper". See BRAND_UPDATE_SAKHI.md.

**Date:** 2026-11-01.

**Status:** implemented and tested (BUSINESS_HELPER_TEST_RESULTS.md). **Not yet tested with learners.** Every statement below about what is easy or familiar for learners is a design assumption.

**Screenshots:**
- `docs/img/business-helper-en.png`: home, amount entry, price result, money result
- `docs/img/business-helper-te.png`: Telugu

## 1. Purpose

Lessons teach the idea, for example that sales are not profit. The Business Helper lets her **use** that idea on her own stall's numbers, in a few spoken or tapped steps, and links back to the matching lesson.

It moves the product along the vision: **learn → apply → (later) voice-first bookkeeping**. It is an educational calculation tool, **not** a bookkeeping record: **nothing she enters is saved**.

## 2. Navigation

**Change:** learner tabs went from 2 to 3: ☀️ Today · 🌱 My learning · 🎙️ **Business Helper**.

| Point | Detail |
|---|---|
| The brief's tab list | It named "Home, My Lessons, My Practice, Progress". Those four were already merged into **Today** and **My learning** in an earlier round (IA_SIMPLIFICATION.md). Every one of those features is still reachable |
| Crowding | Three tabs at 360 px fit with picture + word (no overflow, browser-tested in en / hi / te). No other navigation change was needed |
| Coach View | Still not in the learner navigation (press and hold the ₹ logo, or `#/coach`) |

## 3. Screens

### Home (`#/helper`)

Top to bottom:
1. 🙏 **"How can I help your business today?"**, with 🔊 Listen and 🐢 Slow.
2. A **128 px microphone**: "Tap and speak" → "Listening…" → "Understanding…".
3. "Or tap a picture", then **four large picture cards**:

| Card | Status |
|---|---|
| 💰 Check My Price — "Does my price cover my costs?" | Working |
| 🧮 Understand My Money — "Sales, profit, udhaar" | Working |
| 💬 Customer Message | Dashed card, **Coming soon** |
| 🛡️ Understand a Loan | Dashed card, **Coming soon** |

4. 🔒 "Your amounts are not saved. For learning only. This is not your account book."

**What the microphone does with what she says:**

| She says | What happens |
|---|---|
| "I want to check my selling price" | Opens Check My Price |
| A money / profit / udhaar request | Opens Understand My Money |
| Asks for a loan or message tool | Shows the honest "coming soon" sheet |
| Anything else | "I heard: … I can help with these. Tap one, or say 'price' or 'money'." **No chatbot answer** |

### Check My Price (`#/helper/price`)

Four steps, **one question per screen**. Each has a picture, large words, 🔊 / 🐢, a step bar, and ← Back.

| Step | Question | Input |
|---|---|---|
| 1 | 🛒 What are you selling? | Picture cards for her business (e.g. 🧺 basket of vegetables, 🍅, 🧅, ➕ something else), or say it |
| 2 | 📦 How much did it cost you? | Amount |
| 3 | 🛺 Are there other costs, like transport or packaging? | Amount, or **🚫 No other costs** |
| 4 | 🏷️ How much do you want to sell it for? | Amount |

**Result:**
- Four picture rows: 🏷️ selling price, − 📦 cost, − 🛺 other costs, = 💰 left after these costs. Green if ≥ 0, rose if short.
- Each input row has **✏️ Change**, which goes back to that step and then straight back to the result.
- One spoken sentence, e.g. "If you sell for ₹450, ₹100 is left after the costs you told me."
- Always shown: "This may not be your final profit if there are other costs. I cannot tell you the best price. That depends on your market."
- If she said no other costs: "🤔 You said no other costs. Did you pay for transport, bags or spoiled goods?" plus **"Would you like to practise this?" → Everyday costs**.
- "Did you include every cost?" 👍 Yes / 🤔 Not sure. "Not sure" offers the same practice link. She is **never labelled** as lacking understanding.
- **"Want to understand why?" → Sales and profit lesson.**

### Understand My Money (`#/helper/money`)

She picks one of four picture cards. Each scenario asks two or three short amount questions:

| Scenario | Questions | Result (deterministic) | Lesson link |
|---|---|---|---|
| 💰 Sales and profit | Sales today · cost of the goods sold | Left before other costs (= sales − goods). "Other costs still come out, so your profit is less than ₹X." | Sales and profit |
| 🧾 My everyday costs | Goods · transport · small costs (bags, spoiled goods) | Total costs. If only goods were counted: "Small costs add up too." | Everyday costs |
| 🤝 Cash and udhaar | Sales · "Did you receive all ₹X, or does someone still need to pay you? How much did you receive?" | Sales, cash received, **still owed**. "You made ₹500 in sales, received ₹400 in cash, and are still owed ₹100. That does not mean your profit is ₹500." | Customer credit |
| 👛 Shop money and home money | Cash box · taken for home | Left for the shop; "Keep tomorrow's stock money separate." | Two pockets |

**Checks before the result.** Impossible answers are caught and she is asked to check:
- money received more than sales
- money taken home more than the box
- amounts over ₹1,00,000

Correcting an earlier amount re-asks any later answer it makes impossible.

**Lesson links** open the existing modules. Customer credit and Two pockets currently show the app's honest "taught with your coach" screen.

### Amount entry (shared)

| Part | Detail |
|---|---|
| Display | A large ₹ display |
| 🎤 Say the amount | She says it (e.g. "two hundred and fifty", "दो सौ पचास", "రెండు వందల యాభై"). The app shows "I heard: …" and **reads the amount back aloud**: "Is it ₹250?" |
| No guessing | Several amounts ("400 or 500") or none ("I don't know") are **not guessed**: she is asked to say one amount |
| Tap alternative | A **3 × 4 keypad**: 1–9, 00, 0, ⌫ |
| Confirm | One big **✓ Yes, correct / Continue** button. Nothing is used until she confirms |

## 4. Accessibility choices

| Need | Response |
|---|---|
| Little reading | One question per screen; picture on every question, card and result row; every question and result can be heard (🔊) and slowed (🐢); the question is read automatically after her first tap |
| Unsure with smartphones | Three actions only: **Back**, **Listen / Repeat**, **Continue**. No forms, no chat thread, no scrolling history |
| Numbers she can trust | Large digits (48 px), ₹ with Indian grouping (₹1,500), spoken read-back, Change buttons |
| Big targets | Microphone 128 px (home) / 96 px (amounts); keypad keys 60 px; cards ≥ 132 px; primary buttons 60 px |
| Visual consistency | The app's terracotta / cream / marigold palette, the same "coming soon" dashed style as the preview languages, rose (not red) for "short" |
| Voice fails | Microphone blocked, unsupported or offline → a plain notice; keypad and picture cards always work |

The Sakhi screenshot inspired the warmth, the big central microphone and the illustrated action cards. Its branding, layout and loan / WhatsApp features were **not** copied.

## 5. Scope and safety

| Topic | Rule |
|---|---|
| Fair or optimal prices | Not claimed. The result is "what is left after the costs you told me" |
| Profit | Never called final profit |
| Loans | The loan card is "coming soon". Its description says it **will not tell her whether to take a loan** and sends loan questions to her coach. No loan, investment, insurance or product advice anywhere (tested) |
| Records | No bookkeeping records or transaction history. Amounts live only in the screen's memory; nothing is written to her learner record or to storage (tested) |
| Practice outcomes | Not stored yet. A future opt-in could store only "used the price tool → opened Everyday costs", never amounts (BUSINESS_HELPER_ARCHITECTURE.md §6) |
| AI | **Not used.** Routing, amount reading and every calculation are deterministic, so the tool works without any AI service |

## 6. Languages

| Language | Status |
|---|---|
| English | Full |
| Hindi, Telugu | Full, as **developer drafts** (W43 in `wording-review.csv`, pending native review) |
| বাংলা · অসমীয়া · தமிழ் | Shown as coming soon in the existing language sheet, as in the rest of the app |

Read-aloud uses the selected language's voice when the phone has one; otherwise the existing "No ⟨language⟩ voice on this phone" notice is shown.

## 7. Next steps

1. Try it with 5–8 learners: price one item, then one udhaar day.
   - Can they finish without help?
   - Do they trust the read-back?
   - Do they understand "left after these costs ≠ profit"?
2. Native review (W43).
3. Accept "no other costs" said aloud.
4. Business-specific item lists checked with coordinators.
5. Only then: the customer-message tool, a loan **explainer** with coordinator-approved content, and opt-in practice outcomes.

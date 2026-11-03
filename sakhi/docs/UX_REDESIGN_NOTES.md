# UX redesign notes: voice-first, low-literacy, warm

**Date:** 2026-11-01. **Status:** implemented in the app, with tests run (see §7). The redesign has **not yet been tested with learners**; field validation is the next step (§8).

Before / after (phone width 375 px):
- `docs/img/ux-before-en.png`
- `docs/img/ux-after-en.png`
- `docs/img/ux-after-te.png`

Information architecture: see `IA_SIMPLIFICATION.md`. **Update 2026-11-01:** navigation is now 2 tabs (☀️ Today · 🌱 My learning); practice is tiered (easy → harder) with a picture strip (🧺 − 📦 − 🥀 = 💰 ?). See DIAGNOSTIC_STRATEGY.md.

## 1. Why the previous version was confusing

1. **Too much reading.** Most screens opened with one or two paragraphs, and the Listen control was a small pill beside them. The design assumed she reads first and listens second, which is the wrong way round for this learner.
2. **The microphone looked like one option among many.** It was a 72 px button inside a card, the same visual weight as a choice card.
3. **Answer choices were only heard as one long sentence.** "Listen" read the question and all choices as one block. She could not hear choice 2 again without hearing everything, and could not tell which choice was being read.
4. **Choices looked alike.** Every choice used the same generic icon (✨, a note, a question mark), so they could only be told apart by reading.
5. **Navigation had five destinations,** and two of them (My Practice and Progress) showed the same five topics. Coach View was one tap away from every learner screen.
6. **Cold green palette and small type.** 16–18 px body text and 48 px secondary targets on a mostly white-and-green screen.
7. **Many "locked" and "later" states.** They read as "not for you".

## 2. What changed

### Visual system

| | Before | After |
|---|---|---|
| Palette | Teal `#0F5E57` brand, white | **Terracotta `#B34A1D`** brand, **cream `#FFF6EA`** background, **marigold `#E8892B`** for listening, green only for "correct", a calm **rose `#8E3B5E`** for "try again / needs practice" (never alarm red) |
| Contrast (WCAG) | — | White on brand 5.4:1; brand on white 5.4:1; muted text on cream 7.1:1; green on green-soft 5.3:1; rose on rose-soft 5.9:1. All ≥ 4.5:1 |
| Type | Root 16 px; body 18 px | Root **18 px** (`html { font-size: 112.5% }`), so every rem-based size grows 12.5%. Question text ≈ 22 px; headings 26–32 px; line-height 1.55 (Telugu 1.7, Hindi 1.6 unchanged) |
| Tap targets | 48–64 px | Choices ≥ 72 px tall plus a 64 px-wide 🔊 per choice; primary buttons 60 px, pill-shaped, 22 px bold text; bottom tabs 76 px; mic **88 px**; Listen 56 px; 🐢 63 px |
| Pictures | Generic icons | Emoji pictograms rendered by the phone's own emoji font: ✅ ❌ 🤔 on yes / no / not sure; 🥬 🥛 📦 for stock, by business; 🎒 school fees, 👗 clothes, 🏪 / 🏦 mixed / separate, 🧰 / 🏠 cash box / fixed amount, 📈 📉 up / down; ₹ note picture on amounts. Topics: 💰 🧾 🤝 🪙 👛. Levels: ⚪ 🌱 🌿 🌳 |
| Tone | Clean but clinical | Warm and calm; no confetti, mascots or baby talk. Emoji are used as signs, not decoration (DESIGN_DECISIONS V2 still applies) |

The palette is taken from the orange "Sakhi" inspiration image. Only its colours were used: its "Loan safety" and "WhatsApp message" features were **not** added. Loan advice and messaging are outside this product's scope (PRD non-goals).

### Voice first
- **Listen is the most visible control on every question:** a full-width marigold button "🔊 Listen". 🐢 Slow is a separate round toggle.
- **Question and choices are read aloud one by one.** Listen reads the question, then each choice in turn. The choice being read is **highlighted** with a marigold ring and a gentle pulse; the pulse is turned off when the phone asks for reduced motion. Tapping again stops.
- **Each choice has its own 🔊 button,** so she can hear one answer again before choosing.
- **Auto-read:** after her first tap in the app, each new question is read automatically once. Browsers do not allow speech before any tap, so the very first screen waits for "Listen".
- **Microphone:** an 88 px round button with "Tap and speak" in large type. It sits right below Listen, above the choices. Starting the mic stops any speech, so the app never listens to itself.
- Tap and voice answers both work everywhere, unchanged. A spoken answer is always shown for confirmation before it counts.
- **With no voice installed for her language,** the read-aloud area shows "No Telugu voice on this phone. Please read the text, or ask your coach" instead of a silent button.

### Screens
- **Home:** greeting with 🙏, one "🔊 Today's plan", this week's task (🚩 card with its own 🔊), today's lesson as a big picture card, and one footer action.
- **Lessons:** five picture cards with a number and one status chip: ✅ Done · ▶ Now · 👩‍🏫 With coach.
- **My Journey** (new; merges My Practice and Progress):
  - one-line summary with 🔊
  - 🎯 Practice: "Sales and profit", plus "Quick review" after the lesson
  - my 5 topics with growth emoji and 🔁 "Needs more practice"
  - 🚩 my weekly tasks
  - footer: 🎯 Practice now
- **Practice question:** same answer area as the lessons. Feedback starts with 🎉 or 💡 and has its own 🔊.
- **Lesson questions and diagnostic:** the same shared answer area (`components/AnswerChoices.tsx`). Lesson feedback starts with 🎉 or 💡.
- **Header:** ₹ logo (tap = Home; press and hold = Coach View), title, and a larger 🌐 language button. The 👤 coach icon is gone.
- **Language selector:**
  - English, हिन्दी, తెలుగు: full support.
  - বাংলা, অসমীয়া, தமிழ்: dashed "Coming soon" cards that open a preview (greeting + "Hear hello" if the phone has that voice) and never change the app language.

### Removed
- The My Practice list screen and the Progress screen (merged into My Journey).
- The coach icon in the learner header.
- Home's topic-dot row and "more practice" link.
- Mastery badges on the Lessons list.
- Padlocks on topics that are taught with the coach.
- The text "Slow" on the slow button (now 🐢 plus an accessible label).

## 3. How the redesign serves low-literacy learners

| Need | Design response |
|---|---|
| Understands by listening, not reading | Listen first and largest; question and each choice read separately; auto-read after the first tap; per-choice replay; slow speech |
| Recognises things by picture | A picture cue on every choice, topic, status and section; the ₹ note picture on amounts |
| Gets lost in menus | 3 tabs (picture + word); one main action per screen; coach area hidden |
| Small screen, rough hands, sunlight | Larger type, ≥ 72 px choices, 76 px tabs, high-contrast warm palette |
| Low confidence with technology | Speaking stops the app talking; every spoken answer is confirmed; fewer "locked" states; "With coach" instead of "Later" |
| Feels judged | Rose, not red, for "try again"; growth emoji instead of scores |

## 4. What did not change (and why)
- **Lesson content, scoring, correct answers, the lesson state machine, intent handling and safety guards** are unchanged. The primary journey's 47 checks pass.
- **Lesson explanation screens** (intro / example) still carry a few sentences. They are the approved curriculum text. They now have a bigger Listen button and larger type, but shortening them is a curriculum and native-review task (MULTILINGUAL_REVIEW.md W08–W09), not a visual one.
- **Coach View** keeps its dense, text-first layout (DESIGN_DECISIONS C1). It inherits the warm palette and larger type.

## 5. Accessibility notes
- Every emoji is `aria-hidden`. The word next to it carries the meaning, for screen readers and for clarity.
- Icon-only buttons have labels: 🐢 "Slow", 🔊 "Hear this answer: …", logo "Sakhi · Coach: press and hold" (name updated 2026-11-01).
- Colour is never the only signal: ✅ / 🎉 / 💡 / 🔁 and words accompany green, rose and marigold.
- Reduced motion turns off the reading pulse and the mic ping.

## 6. Known limitations
- **Emoji depend on the phone's emoji font.** Very old Android versions may show some newer emoji (🪙, 🧰) as boxes. They are decorative (`aria-hidden`) and always paired with words, but this should be checked on target phones. Commissioned pictograms are the long-term fix.
- **Auto-read cannot start before her first tap** (browser rule). Whether auto-read helps or annoys must be observed in the field; it can be switched off per screen by `auto={false}`.
- The **new Hindi and Telugu labels** ("मेरा सफ़र / నా ప్రయాణం", "सुनें", "दबाएँ और बोलें / నొక్కి మాట్లాడండి") are developer drafts. They are flagged W32–W35 in `wording-review.csv`. "Journey" may not land as a metaphor (W23).
- **Preview languages** have no interface. The greeting only plays if the phone has a voice for that language.
- **No real speech has been heard.** All read-aloud checks use a simulated speaker (SPEECH_VALIDATION.md).
- **Not yet tested with learners.**

## 7. Verification (2026-11-01)

| Check | Result |
|---|---|
| Unit + integration (`npm test`) | **619 / 619**, 28 files. New: `components/__tests__/readAloud.test.tsx` checks the order of reading, one highlighted choice at a time, per-choice replay, Stop, tap and voice answers, and the no-voice notice. Preview-language test added. My Journey test replaces the Progress test |
| Build (`tsc -b && vite build`) | OK |
| Browser suites (`npm run test:e2e`, real Chromium, simulated microphone and speaker where stated) | **9 / 9 passed.** Primary journey **47 checks**, including the new: auto-read of the question; question then each choice read in Telugu with highlighting; 3 tabs; no coach link; `#/progress` → My Journey; practice read-aloud and feedback; press-and-hold coach entry |
| Evaluations (`eval`, `eval:consistency`, `eval:holdout4`) | Unchanged (understanding logic not touched) |

## 8. Next steps
1. **Moderated usability test** with 5–8 women per language, on their own or the NGO's phones. Tasks:
   - start today's lesson
   - answer by voice
   - hear choice 2 again
   - find "what should I practise?"
   - change the language

   Measure task success and hesitation; ask whether auto-read helps.
2. Native review of the new labels (W32–W35).
3. Replace emoji with commissioned pictograms if testing shows confusion or rendering gaps.
4. Shorten the lesson explanation screens with the curriculum team. Text changes go through native review.

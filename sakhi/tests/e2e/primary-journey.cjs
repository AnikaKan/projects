// Primary journey (DIAGNOSE → TEACH → PRACTICE → TRACK), end to end in a real Chromium against the built app.
//   npm run build && npx vite preview --port 4176   (and optionally `npm run server` for /api)
//   node tests/e2e/primary-journey.cjs
//
// What is REAL here: every screen, the assessment engine, recommendation, lesson state machine, scoring,
// feedback text, weekly challenge, progress repository (localStorage), Coach View.
// What is SIMULATED (and labelled in the output): the microphone and speaker. Part 1 injects a fake
// SpeechRecognition (returns a fixed Telugu phrase) and a fake speechSynthesis (records what would be spoken).
// Part 2 uses the browser's REAL engines; in this container they do not exist, so it verifies the fallback.
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4176/'
const SHOTS = process.env.SHOTS || ''
const problems = []
const log = []
const ok = (c, m) => { log.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) problems.push(m) }

const INJECT = () => {
  window.__t = ''
  window.__recLang = []
  class Rec {
    start() {
      window.__recLang.push(this.lang)
      setTimeout(() => { this.onstart && this.onstart(); setTimeout(() => { const r = Object.assign([{ transcript: window.__t, confidence: 0.9 }], { isFinal: true }); this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend() }, 80) }, 20)
    }
    abort() { this.onend && this.onend() }
    stop() {}
  }
  window.webkitSpeechRecognition = Rec; window.SpeechRecognition = Rec
  window.__spoken = []
  const voices = [{ name: 'T', lang: 'te-IN', localService: true }, { name: 'E', lang: 'en-IN', localService: true }, { name: 'H', lang: 'hi-IN', localService: true }]
  const synth = { getVoices: () => voices, addEventListener() {}, removeEventListener() {}, speak(u) { window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.lang, rate: u.rate }); setTimeout(() => u.onend && u.onend(), 30) }, cancel() {}, pause() {}, resume() {}, speaking: false, paused: false }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
}

;(async () => {
  const b = await chromium.launch()
  // ───────────── Part 1: the primary journey (simulated mic + speaker) ─────────────
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
  await ctx.addInitScript(INJECT)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message))
  const tid = (t) => p.getByTestId(t)
  const primary = () => p.getByTestId('primary').first().click()
  const shot = async (n) => SHOTS && p.screenshot({ path: `${SHOTS}J-${n}.png`, fullPage: true })
  const say = async (t) => {
    await p.evaluate((x) => (window.__t = x), t)
    if (await tid('stt-retry').count()) await tid('stt-retry').click()
    else await tid('stt-mic').click()
    await p.waitForTimeout(400)
  }

  // Fresh device → seeded fictional roster; the active learner is DL-01 (not onboarded).
  await p.goto(BASE + '#/coach')
  await p.waitForSelector('[data-testid=roster-DL-01]')
  const dl02Before = await tid('roster-next-DL-02').innerText()
  ok((await tid('roster-DL-01').innerText()).length > 0, 'Coach roster lists DL-01 before onboarding')

  // 1. Language: Telugu
  await p.goto(BASE + '#/onboarding/language')
  await p.locator('main').getByText('తెలుగు', { exact: true }).click()
  ok((await p.evaluate(() => document.documentElement.lang)) === 'te-IN', 'Language onboarding: <html lang> becomes te-IN')
  await primary()
  // 2. Business: vegetable stall
  const biz = p.locator('main button[aria-pressed]:not(.rounded-full)')
  await biz.nth(0).click()
  ok((await biz.nth(0).getAttribute('aria-pressed')) === 'true', 'Business selected')
  await shot('1-business-te')
  await primary()
  await primary() // start the check
  // 3. Diagnostic Q1 (revenue vs profit), answered INCORRECTLY: "Yes, ₹500 sales is my profit"
  const stem = await tid('stem').innerText()
  ok(stem.includes('కూరగాయలు') && stem.includes('₹500'), `Diagnostic is in Telugu and about the vegetable stall: "${stem.slice(0, 60)}…"`)
  // Read-aloud uses the Telugu voice (simulated speaker)
  // UX redesign: "Listen" reads the question AND every answer choice, highlighting the choice being read.
  // After her first taps, a new question is read automatically once (browser autoplay rules allow it then).
  await p.waitForFunction(() => document.querySelector('[data-testid=read-aloud]')?.getAttribute('data-reading') === '', null, { timeout: 5000 })
  const auto = await p.evaluate(() => window.__spoken.map((x) => x.text))
  ok(auto.some((x) => x.includes('కూరగాయలు')), 'Question was read aloud automatically when it appeared (SIMULATED speaker)')
  const n0q = await p.evaluate(() => window.__spoken.length)
  await tid('tts-play').first().click()
  await p.waitForTimeout(40)
  const highlighted = await p.locator('[data-reading="true"]').count() + (await tid('read-aloud').getAttribute('data-reading') ? 1 : 0)
  await p.waitForTimeout(400)
  const said = await p.evaluate((n) => window.__spoken.slice(n), n0q)
  ok(said.length >= 4 && said.every((x) => x.voice === 'te-IN') && said[0].text.includes('కూరగాయలు') && said.slice(1).map((x) => x.text).join('|') === 'అవును|లేదు|తెలియదు' && highlighted > 0,
    `Listen reads the Telugu question then each choice with a te-IN voice, highlighted while read (SIMULATED speaker): ${said.map((x) => x.text.slice(0, 18)).join(' | ')}`)
  // Answer by voice (SIMULATED mic): "అవును, ఐదు వందలు లాభమే"
  await say('అవును, ఐదు వందలు లాభమే')
  ok((await p.evaluate(() => window.__recLang.at(-1))) === 'te-IN', 'Recognition requested in te-IN (never English)')
  ok((await tid('stt-match').getAttribute('data-option')) === 'yes', 'Spoken answer matched "అవును" (shown for confirmation, not scored yet)')
  await tid('stt-confirm').click()
  await primary() // confirm answer
  ok((await tid('feedback').getAttribute('data-outcome')) === 'misconception', 'Diagnostic scored the answer as a misconception (deterministic engine)')
  await shot('2-diagnostic-feedback')
  await primary()
  // Remaining items answered correctly
  for (const id of ['stock', 'no', 'yes', 'no']) {
    await tid(`option-${id}`).click()
    await primary()
    await primary()
  }
  // 4. Recommendation from the REAL result
  await p.waitForSelector('[data-testid=recommendation]')
  const rec = tid('recommendation')
  ok((await rec.getAttribute('data-lesson')) === 'revenue_vs_profit' && (await rec.getAttribute('data-reason')) === 'misconception', `Recommendation = revenue_vs_profit because of the misconception (got ${await rec.getAttribute('data-lesson')}/${await rec.getAttribute('data-reason')})`)
  ok((await tid('tier').getAttribute('data-tier')) === 'foundational', 'Two-tier diagnostic: sales/profit wrong → stays at the foundational level after 5 questions (no harder questions)')
  await shot('3-recommendation')
  await tid('start-lesson').click()
  // 5. Lesson opens on the misconception, with spoken guidance
  await p.waitForSelector('[data-testid=lesson]')
  ok((await tid('lesson').getAttribute('data-step')) === 'assessment_result', 'Lesson starts by naming her diagnostic result')
  ok((await tid('result-message').innerText()).includes('లాభంగా'), 'Lesson opening refers to her specific misconception (sales counted as profit)')
  await primary()
  const n0 = await p.evaluate(() => window.__spoken.length)
  await tid('tts-play').first().click()
  await p.waitForTimeout(150)
  const s1 = await p.evaluate((n) => window.__spoken.slice(n), n0)
  ok(s1.length > 0 && s1.every((x) => x.voice === 'te-IN'), `Lesson step read aloud in Telugu (SIMULATED speaker): "${(s1[0]?.text || '').slice(0, 50)}…"`)
  await primary(); await primary()
  // Response question by voice (SIMULATED mic): "రెండు వందలు"
  ok((await tid('lesson').getAttribute('data-step')) === 'response', 'Reached the first lesson question')
  await say('రెండు వందలు')
  ok((await tid('stt-match').getAttribute('data-option')) === 'left', 'Spoken "రెండు వందలు" → ₹200 option')
  await tid('stt-confirm').click()
  await primary()
  ok((await tid('feedback').getAttribute('data-tone')) === 'positive', 'Correct lesson answer → positive feedback')
  await primary()
  // 6. NEW practice question, answered with the "hidden costs" mistake, then corrected
  ok((await tid('lesson').getAttribute('data-step')) === 'practice', 'Practice question shown')
  const pq = await tid('stem').innerText()
  ok(['₹800', '₹450', '₹50', '₹30'].every((a) => pq.includes(a)), 'Practice question is a new scenario (₹800 sales, ₹450 + ₹50 + ₹30 costs)')
  // A clarification request is NOT an answer
  await say('మళ్ళీ చెప్పండి, అర్థం కాలేదు')
  ok((await tid('stt-nomatch').getAttribute('data-kind')) === 'clarification_request' && (await tid('stt-confirm').isDisabled()), 'Clarification request during practice is not treated as an answer')
  await tid('option-goods_only').click()
  await primary()
  const fb1 = await tid('feedback').innerText()
  ok((await tid('feedback').getAttribute('data-tone')) === 'corrective' && fb1.includes('₹270') && fb1.includes('₹80'), `Wrong practice answer → corrective feedback with the right numbers (₹800 − ₹530 = ₹270): "${fb1.slice(0, 80)}…"`)
  await shot('4-practice-corrective')
  await primary() // try again
  await tid('option-profit').click()
  await primary()
  ok((await tid('feedback').getAttribute('data-tone')) === 'positive', 'Retry with ₹270 → positive feedback')
  await primary()
  await tid('option-down').click(); await primary()
  ok((await tid('feedback').getAttribute('data-tone')) === 'positive', 'Check question answered correctly')
  await primary()
  // 7. Weekly challenge
  ok((await tid('lesson').getAttribute('data-step')) === 'challenge', 'Weekly challenge step')
  ok((await tid('challenge-text').innerText()).includes('మండీ'), 'Challenge is specific to the vegetable stall')
  await shot('5-challenge')
  await primary() // accept
  // Documented rule (machine.evaluate): practice must be right on the FIRST try for "understood";
  // she needed a retry, so the honest result is "developing" — one correct answer is not mastery.
  ok((await tid('completion').getAttribute('data-result')) === 'developing', `Completion result = developing (practice needed a retry) (got ${await tid('completion').getAttribute('data-result')})`)
  await primary()
  await p.waitForSelector('[data-testid=home-challenge]')
  ok(true, 'Home shows this week’s challenge')
  // 8. Persistence: reload (new session on the same device)
  await p.reload()
  await p.waitForSelector('[data-testid=home-challenge]')
  ok((await p.evaluate(() => document.documentElement.lang)) === 'te-IN', 'After reload: still Telugu, challenge still shown')
  // Next in her path is module 2, which has no in-app lesson yet: Home says so and offers practice (no dead end)
  ok((await tid('home-today').getAttribute('data-module')) === 'm2' && (await tid('home-with-coach').count()) === 1, 'Home: next module (2) is marked "with your coach"; primary action = practise module 1')
  // Simplified navigation (UX redesign): three learner tabs; Coach View is not in the learner's way.
  ok((await p.locator('nav[aria-label=Primary] a').count()) === 3 && (await tid('nav-journey').count()) === 1 && (await tid('nav-helper').count()) === 1, 'Learner navigation has exactly 3 tabs: Today · My Learning · Business')
  ok((await tid('home-now').getAttribute('data-kind')) === 'practice' && (await tid('home-next').getAttribute('data-kind')) === 'coach', 'Today after the lesson: NOW = practice, NEXT = next topic with the coach')
  ok((await p.locator('header a[href="#/coach"]').count()) === 0, 'No Coach View link in the learner header')
  await tid('nav-journey').click()
  await p.waitForSelector('[data-testid=prog-m1]')
  ok((await tid('prog-m1').getAttribute('data-level')) === 'practicing' && (await tid('journey-practice-m1').getAttribute('data-enabled')) === 'true' && (await tid('journey-practice-review').getAttribute('data-enabled')) === 'true',
    'My Journey (merged Practice + Progress) shows the topic level and offers practice + review')
  ok((await p.evaluate(() => location.hash)) === '#/journey', 'Old /practice and /progress routes are replaced by /journey')
  await p.goto(BASE + '#/progress'); await p.waitForTimeout(200)
  ok((await p.evaluate(() => location.hash)) === '#/journey', 'Old #/progress link redirects to My Journey')
  // Practice from My Journey: question + choices read aloud, tap answer, accurate feedback
  await p.goto(BASE + '#/practice/m1'); await p.waitForSelector('[data-testid=stem]')
  await p.waitForFunction(() => document.querySelector('[data-testid=read-aloud]')?.getAttribute('data-reading') === '', null, { timeout: 5000 })
  const pr = await p.evaluate(() => window.__spoken.slice(-4).map((x) => x.text))
  ok(pr.length === 4 && pr.slice(1).every((x) => /రూపాయలు/.test(x)), `Practice question and its 3 amount choices were read aloud (SIMULATED speaker): ${pr.map((x) => x.slice(0, 14)).join(' | ')}`)
  // Tiered practice: a foundational learner first gets the EASY question (two numbers), then a harder one.
  ok((await tid('stem').getAttribute('data-tier')) === 'foundational' && (await tid('sum-strip').count()) === 1, 'Practice starts easy for a foundational learner: 🧺 sales − 📦 stock = 💰 ? (picture strip, short question)')
  await tid('option-b').click(); await primary()
  ok((await tid('practice-feedback').getAttribute('data-correct')) === 'false', 'Easy practice: ₹1,500 (all the sales) → hint')
  await primary() // try again
  await tid('option-a').click(); await primary()
  ok((await tid('practice-feedback').getAttribute('data-correct')) === 'true', 'Easy practice: ₹600 → correct')
  await primary() // next question
  ok((await tid('stem').getAttribute('data-tier')) === 'intermediate', 'Then the harder question with spoiled goods')
  await tid('option-a').click(); await primary()
  ok((await tid('practice-feedback').getAttribute('data-correct')) === 'false' && (await tid('practice-feedback').innerText()).length > 10, 'Practice: ₹600 (forgot the wasted goods) → specific hint')
  await primary() // try again
  await tid('option-b').click(); await primary()
  ok((await tid('practice-feedback').getAttribute('data-correct')) === 'true', 'Practice: ₹500 → correct, with the worked equation')
  // Facilitator: press and hold the logo to open Coach View
  await p.goto(BASE + '#/journey'); await p.waitForSelector('[data-testid=coach-entry]')
  const logo = tid('coach-entry')
  const box = await logo.boundingBox()
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await p.mouse.down(); await p.waitForTimeout(1000); await p.mouse.up()
  await p.waitForTimeout(300)
  ok((await p.evaluate(() => location.hash)).startsWith('#/coach'), 'Press-and-hold on the logo opens Coach View (hidden facilitator entry)')
  await p.goto(BASE + '#/home'); await p.waitForSelector('[data-testid=home-challenge]')
  await shot('6-home-after-reload')
  // 9. Coach View sees the update (same device, as in a facilitated session)
  await p.setViewportSize({ width: 1280, height: 900 })
  await p.goto(BASE + '#/coach/learner/DL-01')
  await p.waitForSelector('[data-testid=coach-lessons]')
  ok((await tid('lesson-m1').getAttribute('data-status')) === 'completed', 'Coach: DL-01 lesson 1 completed')
  const lvl = await tid('concept-m1').getAttribute('data-level')
  // Her first tries in practice were wrong (she got them right on retry), so the documented rule keeps
  // her at "practising": "shown understanding" needs two independent FIRST-TRY correct answers.
  ok(lvl === 'practicing', `Coach: DL-01 revenue-vs-profit level = practising (first tries were wrong; no mastery claimed) (got ${lvl})`)
  ok((await tid('coach-assessment').innerText()).includes('Misconception'), 'Coach: DL-01 diagnostic misconception shown')
  ok((await tid('challenge-next').getAttribute('data-agreed')) === 'true' && (await tid('challenge-next').innerText()).length > 20, 'Coach: DL-01 weekly challenge shown (agreed this week)')
  ok((await tid('coach-learner-lang').innerText()).includes('తెలుగు'), 'Coach: DL-01 language Telugu')
  await shot('7-coach-DL01')
  // Isolation: another learner is unchanged
  ok((await tid('roster-next-DL-02').innerText()) === dl02Before, 'Isolation: DL-02 roster entry unchanged by DL-01’s work')
  await ctx.close()

  // ───────────── Part 2: a DIFFERENT result gives a DIFFERENT recommendation (fresh device, Hindi, tea stall) ─────────────
  const ctx2 = await b.newContext({ viewport: { width: 375, height: 812 } })
  const q = await ctx2.newPage()
  q.on('pageerror', (e) => problems.push('pageerror ' + e.message))
  await q.goto(BASE + '#/onboarding/language')
  await q.locator('main').getByText('हिन्दी', { exact: true }).click()
  await q.getByTestId('primary').first().click()
  await q.locator('main button[aria-pressed]:not(.rounded-full)').nth(1).click() // tea stall
  await q.getByTestId('primary').first().click()
  await q.getByTestId('primary').first().click()
  // Correct on revenue/profit, expenses, separation, savings — WRONG on customer credit ("yes, udhaar is cash today")
  for (const id of ['no', 'stock', 'yes', 'yes', 'no']) {
    await q.getByTestId(`option-${id}`).click()
    await q.getByTestId('primary').first().click()
    await q.getByTestId('primary').first().click()
  }
  // 4 of 5 right incl. sales/profit → "well done" and harder (applied) questions for the MVP-core topics she got right
  await q.waitForSelector('[data-testid=tier-unlocked]')
  ok((await q.getByTestId('tier-unlocked').getAttribute('data-more')) === '3', 'Two-tier diagnostic: foundational round passed → 3 harder questions unlocked')
  await q.getByTestId('unlock-continue').click()
  for (const id of ['profit', 'total', 'fixed']) {
    await q.getByTestId(`option-${id}`).click()
    await q.getByTestId('primary').first().click()
    await q.getByTestId('primary').first().click()
  }
  await q.waitForSelector('[data-testid=recommendation]')
  ok((await q.getByTestId('tier').getAttribute('data-tier')) === 'intermediate', 'Learner level shown: intermediate (ready for harder questions)')
  const r2 = await q.getByTestId('recommendation').getAttribute('data-lesson')
  ok(r2 === 'customer_credit', `Different diagnostic result → different recommendation (DL-05: ${r2})`)
  await q.getByTestId('start-lesson').click()
  await q.waitForTimeout(300)
  const body = await q.locator('main').innerText()
  ok(!/Placeholder/.test(body), 'Unwritten module does not show a raw "Placeholder" screen')
  ok((await q.getByTestId('module-not-ready').count()) === 1, 'Unwritten module shows the honest "not ready yet" screen with a next step')
  if (SHOTS) await q.screenshot({ path: `${SHOTS}J-8-module-not-ready.png`, fullPage: true })
  await ctx2.close()

  // ───────────── Part 3: REAL browser speech engines (none exist in this container) ─────────────
  const ctx3 = await b.newContext({ viewport: { width: 375, height: 812 } })
  const r = await ctx3.newPage()
  await r.goto(BASE + '#/lessons/m1')
  await r.waitForSelector('[data-testid=lesson]')
  await r.waitForTimeout(800)
  const fallback = await r.getByTestId('tts-fallback').count()
  const controls = await r.getByTestId('tts-play').count()
  if (controls) { await r.getByTestId('tts-play').first().click(); await r.waitForTimeout(800) }
  const fbAfter = await r.getByTestId('tts-fallback').count()
  ok(fallback + fbAfter > 0, `Real engines: no voice installed → clearly identified fallback notice shown (notice=${fallback + fbAfter}, play buttons=${controls})`)
  if (SHOTS) await r.screenshot({ path: `${SHOTS}J-9-real-engine-fallback.png`, fullPage: true })
  await ctx3.close()

  await b.close()
  console.log(log.join('\n'))
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.join('\n') : `\nPRIMARY JOURNEY: ALL ${log.length} CHECKS PASSED`)
  process.exit(problems.length ? 1 : 0)
})()

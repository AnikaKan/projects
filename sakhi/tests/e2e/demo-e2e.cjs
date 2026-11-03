// Presentation demo (#/demo) in a real Chromium against the production build.
// Part A: the real browser engines as they are in headless Chromium (honest fallbacks, tap path).
// Part B: SIMULATED speech engines (tests/e2e/fake-speech.cjs) to drive "Yes" / "repeat" / "No" by voice.
//         This checks the app's handling of recognition results, NOT real speech recognition.
const { chromium } = require('playwright')
const { INJECT } = require('./fake-speech.cjs')
const SP = process.env.SHOTS_DIR || require('os').tmpdir()
const BASE = process.env.BASE || 'http://localhost:4176/'
const problems = []
const log = []
const ok = (c, m) => { log.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) problems.push(m) }
require('fs').mkdirSync(`${SP}/shots`, { recursive: true })
;(async () => {
  const b = await chromium.launch()

  // ── A. Real engines, tap path, isolation, reset
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => problems.push('A pageerror ' + e.message))
    const tid = (t) => p.getByTestId(t)
    // Real app first, so real learner records exist on this device.
    await p.goto(BASE + '#/coach')
    await p.waitForSelector('[data-testid=coach-list]')
    const realBefore = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hisaab.progress')).sort().map((k) => k + '=' + localStorage.getItem(k).length).join('|'))
    const t0 = Date.now()
    await p.goto(BASE + '#/demo')
    await p.waitForSelector('[data-testid=demo-language]')
    const langs = await p.locator('[data-testid^=demo-lang-]').allInnerTexts()
    ok(langs.length === 6 && ['English', 'हिन्दी', 'తెలుగు', 'বাংলা', 'অসমীয়া', 'தமிழ்'].every((n) => langs.some((t) => t.includes(n))), `Six languages shown (${langs.length})`)
    ok((await p.locator('[data-preview=true]').count()) === 3, 'Bengali, Assamese, Tamil marked as coming soon')
    await p.screenshot({ path: `${SP}/shots/DEMO-1-language.png` })
    await tid('demo-lang-en').click()
    await p.waitForSelector('[data-testid=demo-question]')
    ok((await tid('demo-stem').innerText()).startsWith('You sold ₹500 worth of vegetables today'), 'English opens the diagnostic immediately')
    const voiceState = (await tid('tts-fallback').count()) ? `TTS fallback (${await tid('tts-fallback').getAttribute('data-reason')})` : 'TTS Listen button shown'
    log.push(`INFO  Headless Chromium real engines: ${voiceState}`)
    await p.screenshot({ path: `${SP}/shots/DEMO-2-question.png` })
    await tid('option-yes').click()
    ok((await tid('demo-answer-source').getAttribute('data-source')) === 'tap', 'Tap answer labelled as tapped (not as voice)')
    await tid('demo-submit').click()
    ok((await tid('demo-result').getAttribute('data-lesson')) === 'revenue_vs_profit', 'Recommendation: Sales and profit')
    ok((await tid('demo-rec-level').getAttribute('data-level')) === 'foundational', 'Suggested level: Foundational')
    await p.screenshot({ path: `${SP}/shots/DEMO-3-result.png` })
    await tid('demo-to-coach').click()
    ok((await tid('demo-coach').getAttribute('data-rule')) === 'R1_MISCONCEPTION', 'Coach View: rule R1 from the recorded answer')
    ok((await tid('demo-evidence').innerText()).includes('Tapped'), 'Coach View evidence shows the tapped answer')
    await p.screenshot({ path: `${SP}/shots/DEMO-4-coach.png` })
    log.push(`INFO  Tap path, language → coach: ${((Date.now() - t0) / 1000).toFixed(1)} s of automation`)
    await p.reload()
    await p.waitForSelector('[data-testid=demo-coach]')
    ok(true, 'Demo state survives a page reload (presentation safety)')
    await tid('demo-reset').click()
    ok((await tid('demo').getAttribute('data-stage')) === 'language', 'Reset returns to language selection')
    const realAfter = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hisaab.progress')).sort().map((k) => k + '=' + localStorage.getItem(k).length).join('|'))
    ok(realAfter === realBefore, 'Real learner records unchanged by the demo and its reset')
    ok(await p.evaluate(() => !Object.keys(localStorage).some((k) => k.includes('PD-01'))), 'No demo learner written to the app store')
    // The original app still works
    await p.goto(BASE + '#/coach/learner/DL-02')
    await p.waitForSelector('[data-testid=coach-recommended]')
    ok((await tid('coach-recommended').getAttribute('data-lesson')) === 'revenue_vs_profit', 'Original Coach View still works after the demo')
    await ctx.close()
  }

  // ── B. Simulated speech engines: Yes, Repeat, I don't understand, No
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript(INJECT)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => problems.push('B pageerror ' + e.message))
    const tid = (t) => p.getByTestId(t)
    await p.goto(BASE + '#/demo')
    await tid('demo-lang-en').click()
    await p.waitForSelector('[data-testid=demo-question]')
    await p.waitForFunction(() => window.__spoken.length >= 4, null, { timeout: 8000 }).catch(() => {})
    const spoken = await p.evaluate(() => window.__spoken.map((u) => [u.text, u.lang]))
    ok(spoken.length >= 4 && /You sold 500 rupees/.test(spoken[0][0]) && spoken.every((s) => s[1] === 'en-IN'), `Question and choices read aloud in English after the tap (${spoken.length} utterances, simulated synth)`)
    const sayIt = async (t) => {
      await p.evaluate((x) => (window.__stt = { kind: 'result', transcript: x }), t)
      await (await tid('stt-retry').count() ? tid('stt-retry') : tid('stt-mic')).click()
      await p.waitForSelector('[data-testid=stt-transcript]')
    }
    await sayIt('repeat')
    ok((await tid('stt-match').count()) === 0 && (await tid('demo-submit').isDisabled()), '"Repeat" is not an answer')
    await sayIt("I don't understand")
    ok((await tid('stt-match').count()) === 0 && (await tid('demo-submit').isDisabled()), '"I don\'t understand" is not an answer')
    await sayIt('yes')
    ok((await tid('stt-match').getAttribute('data-option')) === 'yes', '"Yes" recognised as Yes')
    await p.screenshot({ path: `${SP}/shots/DEMO-2b-heard-yes.png` })
    await tid('stt-confirm').click()
    ok((await tid('demo-answer-source').innerText()).includes('Heard: “yes”'), 'Recognised words shown')
    await tid('demo-submit').click()
    await tid('demo-to-coach').click()
    ok((await tid('demo-evidence').innerText()).includes('Spoken: “yes”'), 'Coach View shows the same spoken answer')
    // "No" → a different result
    await tid('demo-stage-question').click()
    await sayIt('no')
    await tid('stt-confirm').click()
    await tid('demo-submit').click()
    ok((await tid('demo-result').getAttribute('data-lesson')) === 'business_expenses' && (await tid('demo-result').getAttribute('data-kind')) === 'correct', '"No" gives a different result (no misconception; next topic)')
    await tid('demo-to-coach').click()
    ok((await tid('demo-misconception').count()) === 0, 'Coach View for "No" claims no misconception')
    await ctx.close()
  }

  // ── C. Phone-sized screen
  {
    const p = await b.newPage({ viewport: { width: 390, height: 844 } })
    await p.goto(BASE + '#/demo')
    await p.getByTestId('demo-reset').click()
    await p.getByTestId('demo-lang-en').click()
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'No horizontal overflow at 390 px')
  }
  await b.close()
  console.log(log.join('\n'))
  console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : `DEMO: ALL ${log.filter((l) => l.startsWith('PASS')).length} CHECKS PASSED`)
})()

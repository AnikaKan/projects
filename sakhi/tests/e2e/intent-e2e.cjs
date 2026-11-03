const { chromium } = require('playwright')
const BASE = 'http://localhost:4176/'
const problems = []
const ok = (c, m) => { if (!c) problems.push(m) }
const INJECT = () => {
  window.__t = ''
  class Rec { start() { setTimeout(() => { this.onstart && this.onstart(); setTimeout(() => { const r = Object.assign([{ transcript: window.__t, confidence: 0.9 }], { isFinal: true }); this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend() }, 80) }, 20) } abort() { this.onend && this.onend() } stop() {} }
  window.webkitSpeechRecognition = Rec; window.SpeechRecognition = Rec
  window.__spoken = []
  const synth = { getVoices: () => [{ name: 'S', lang: 'en-IN', localService: true }, { name: 'H', lang: 'hi-IN', localService: true }], addEventListener() {}, removeEventListener() {}, speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50) }, cancel() {}, pause() {}, resume() {} }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
}
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
  await ctx.addInitScript(INJECT)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message))
  const say = async (t) => {
    await p.evaluate((x) => (window.__t = x), t)
    if (await p.getByTestId('stt-retry').count()) await p.getByTestId('stt-retry').click()
    else await p.getByTestId('stt-mic').click()
    await p.waitForTimeout(400)
  }
  // Assessment (Hindi): question 1 is "is ₹500 your profit?" (yes/no)
  await p.goto(BASE + '#/onboarding/language')
  await p.locator('main').getByText('हिन्दी', { exact: true }).click()
  await p.getByTestId('primary').first().click()
  await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(0).click()
  await p.getByTestId('primary').first().click()
  await p.getByTestId('primary').first().click() // start
  const spokenBefore = await p.evaluate(() => window.__spoken.length)
  await say('फिर से बताइए, समझ नहीं आया')
  const kind = await p.getByTestId('stt-nomatch').getAttribute('data-kind')
  ok(kind === 'clarification_request', 'assessment clarification kind ' + kind)
  ok(await p.getByTestId('stt-confirm').isDisabled(), 'confirm disabled on clarification')
  ok((await p.evaluate(() => window.__spoken.length)) > spokenBefore, 'question re-read aloud')
  console.log('assessment hi "फिर से बताइए, समझ नहीं आया" →', kind, '| message:', await p.getByTestId('stt-nomatch').innerText())
  await p.screenshot({ path: '' + (process.env.SHOTS_DIR || require('os').tmpdir()) + '/shots/I-clarify-hi.png', fullPage: true })
  await say('मेरा बैंक खाता नंबर 123456789012 है')
  ok((await p.getByTestId('stt-intent').getAttribute('data-kind')) === 'sensitive_information', 'sensitive')
  ok(!(await p.locator('body').innerText()).includes('123456789012'), 'number removed from screen')
  console.log('assessment hi account number →', await p.getByTestId('stt-intent').innerText())
  await p.screenshot({ path: '' + (process.env.SHOTS_DIR || require('os').tmpdir()) + '/shots/I-sensitive-hi.png', fullPage: true })
  await say('नहीं, मुनाफ़ा ₹500 नहीं है')
  ok((await p.getByTestId('stt-match').getAttribute('data-option')) === 'no', 'real answer still matched')
  // Lesson (English): amount question
  await p.goto(BASE + '#/onboarding/language')
  await p.locator('main').getByText('English', { exact: true }).click()
  await p.getByTestId('primary').first().click()
  await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(0).click()
  await p.getByTestId('primary').first().click()
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hisaab.lesson')).forEach((k) => localStorage.removeItem(k)))
  await p.goto(BASE + '#/lessons/m1'); await p.waitForTimeout(300)
  for (let i = 0; i < 3; i++) await p.getByTestId('primary').first().click()
  const reqs = []
  p.on('request', (r) => r.url().includes('/api/explain') && r.method() === 'POST' && reqs.push(r.url()))
  await say('maybe 200, or maybe 500')
  const msg = await p.getByTestId('stt-nomatch').innerText()
  ok((await p.getByTestId('stt-nomatch').getAttribute('data-kind')) === 'ambiguous_amount', 'lesson ambiguous')
  console.log('lesson en "maybe 200, or maybe 500" →', msg)
  await p.screenshot({ path: '' + (process.env.SHOTS_DIR || require('os').tmpdir()) + '/shots/I-ambiguous-en.png', fullPage: true })
  await say('my OTP is 4455')
  ok((await p.getByTestId('stt-intent').getAttribute('data-kind')) === 'sensitive_information', 'lesson sensitive')
  await p.waitForTimeout(300)
  ok(reqs.length === 0, 'nothing posted to AI: ' + reqs.length)
  ok((await p.getByTestId('lesson').getAttribute('data-step')) === 'response', 'lesson did not advance')
  await say('two hundred')
  ok((await p.getByTestId('stt-match').getAttribute('data-option')) === 'left', 'lesson answer matched')
  await b.close()
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL INTENT BROWSER CHECKS PASSED')
})()

// Browser check with a SIMULATED microphone/speaker (real app). Needs `npm run build && npx vite preview --port 4176`. Run: node tests/e2e/multilingual-e2e.cjs
const { chromium } = require('playwright')
const BASE = 'http://localhost:4176/'
const SHOTS = process.env.SHOTS || './'
const problems = []
const ok = (c, m) => { if (!c) problems.push(m) }
const INJECT = () => {
  window.__t = ''
  class Rec { start() { setTimeout(() => { this.onstart && this.onstart(); setTimeout(() => { const r = Object.assign([{ transcript: window.__t, confidence: 0.9 }], { isFinal: true }); this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend() }, 80) }, 20) } abort() { this.onend && this.onend() } stop() {} }
  window.webkitSpeechRecognition = Rec; window.SpeechRecognition = Rec
  window.__spoken = []
  const synth = { getVoices: () => [{ name: 'S', lang: 'en-IN', localService: true }, { name: 'H', lang: 'hi-IN', localService: true }, { name: 'T', lang: 'te-IN', localService: true }], addEventListener() {}, removeEventListener() {}, speak(u) { window.__spoken.push({ text: u.text, rate: u.rate }); setTimeout(() => u.onend && u.onend(), 50) }, cancel() {}, pause() {}, resume() {} }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t } }
}
;(async () => {
  const b = await chromium.launch()
  for (const [langLabel, cases] of [
    ['తెలుగు', [['మళ్ళీ చదివి వినిపించండి', 'clarification_request', null], ['simple ga explain cheyyandi', 'clarification_request', 'slow'], ['naaku idea ledu', 'match:unsure', null], ['కాదండి, ఖర్చు తీసేయాలి', 'match:no', null], ['నాకు తెల్వదు', 'match:unsure', null], ['ఏం అన్నారు?', 'clarification_request', null]]],
    ['हिन्दी', [['मुझे नहीं पता', 'match:unsure', null], ['थोड़ा आसान भाषा में समझाइए', 'clarification_request', 'slow'], ['dobara padh ke sunaiye', 'clarification_request', null], ['kya bola aapne?', 'clarification_request', null], ['फ़ायदा मतलब क्या होता है?', 'clarification_request', 'slow']]],
  ]) {
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
    await p.goto(BASE + '#/onboarding/language')
    await p.locator('main').getByText(langLabel, { exact: true }).click()
    await p.getByTestId('primary').first().click()
    await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(0).click()
    await p.getByTestId('primary').first().click()
    await p.getByTestId('primary').first().click() // start the check (question 1: yes/no)
    for (const [text, want, rate] of cases) {
      const before = await p.evaluate(() => window.__spoken.length)
      await say(text)
      let got
      if (want.startsWith('match:')) got = 'match:' + (await p.getByTestId('stt-match').getAttribute('data-option'))
      else got = await p.getByTestId('stt-nomatch').getAttribute('data-kind')
      ok(got === want, `${text}: ${got} ≠ ${want}`)
      if (want === 'clarification_request') {
        ok(await p.getByTestId('stt-confirm').isDisabled(), `${text}: confirm must be disabled`)
        const spoken = await p.evaluate((n) => window.__spoken.slice(n), before)
        ok(spoken.length > 0, `${text}: question re-read`)
        if (rate === 'slow') ok(spoken.at(-1).rate < 1, `${text}: re-read slowly (rate ${spoken.at(-1)?.rate})`)
        console.log(`${langLabel} “${text}” → ${got} | ${await p.getByTestId('stt-nomatch').innerText()} | rate ${spoken.at(-1)?.rate}`)
        if (rate === 'slow') await p.screenshot({ path: SHOTS + `M-simplify-${langLabel === 'తెలుగు' ? 'te' : 'hi'}.png`, fullPage: true })
      } else console.log(`${langLabel} “${text}” → ${got}`)
    }
    await ctx.close()
  }
  await b.close()
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL MULTILINGUAL BROWSER CHECKS PASSED')
})()

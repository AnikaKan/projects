// MOCKED Claude: run tests/e2e/mock-anthropic.mjs (fixtures on :8899) and start the server with ANTHROPIC_API_KEY=sk-test-fake CLAUDE_API_BASE_URL=http://localhost:8899. This verifies wiring, guards and fallbacks, NOT real Claude output.
const { chromium } = require('playwright')
const SP = process.env.SHOTS_DIR || require('os').tmpdir()
const BASE = 'http://localhost:4176/'
const problems = []
const note = (m) => console.log(m)
async function onboard(p, native, biz) {
  await p.goto(BASE + '#/onboarding/language')
  await p.locator('main').getByText(native, { exact: true }).click()
  await p.getByTestId('primary').first().click()
  await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(biz).click()
  await p.getByTestId('primary').first().click()
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hisaab.lesson')).forEach((k) => localStorage.removeItem(k)))
  await p.goto(BASE + '#/lessons/m1')
  await p.waitForTimeout(300)
}
const step = (p) => p.getByTestId('lesson').getAttribute('data-step')
const primary = (p) => p.getByTestId('primary').first().click()
const card = async (p) => {
  await p.waitForSelector('[data-testid=ai-card], [data-testid=ai-hidden]', { state: 'attached', timeout: 15000 })
  const c = p.getByTestId('ai-card')
  if (!(await c.count())) return { hidden: await p.getByTestId('ai-hidden').getAttribute('data-reason') }
  return { source: await c.getAttribute('data-source'), reason: await c.getAttribute('data-reason'), type: await c.getAttribute('data-type'), permitted: await c.getAttribute('data-permitted'), text: await p.getByTestId('ai-text').innerText() }
}
;(async () => {
  const b = await chromium.launch()
  for (const [code, native, biz] of [['en', 'English', 0], ['hi', 'हिन्दी', 0], ['te', 'తెలుగు', 1]]) {
    const p = await b.newPage({ viewport: { width: 375, height: 812 } })
    p.on('pageerror', (e) => problems.push(`${code} pageerror ${e.message}`))
    await onboard(p, native, biz)
    await primary(p); await primary(p)
    await p.getByTestId('another-way').click()
    const c = await card(p)
    await p.screenshot({ path: `${SP}/shots/AI-${code}-example.png`, fullPage: true })
    note(`${code} example: ${JSON.stringify(c)}`)
    if (c.source !== 'claude') problems.push(`${code} example not claude: ${JSON.stringify(c)}`)
    if (code === 'en') {
      // permitted continue → NEXT
      await p.getByTestId('ai-action').click()
      if ((await step(p)) !== 'response') problems.push('en ai-action continue')
      // wrong answer → feedback → model reply has WRONG maths → must be refused, approved alternative shown
      await p.getByTestId('option-sales').click(); await primary(p)
      await p.getByTestId('another-way').click()
      await p.waitForTimeout(800)
      const fbText = await p.getByTestId('feedback').innerText()
      const c2 = await p.getByTestId('ai-card').count() ? await card(p) : { hidden: await p.getByTestId('ai-hidden').getAttribute('data-reason') }
      note(`en feedback (model gave ₹500 − ₹300 = ₹250): ${JSON.stringify(c2)}; on screen: "${fbText.slice(0, 80)}"`)
      if (c2.hidden !== 'guard:numbers' || !fbText.includes('Think of it like this')) problems.push('wrong maths not refused')
      await p.screenshot({ path: `${SP}/shots/AI-en-refused.png`, fullPage: true })
    }
    await p.close()
  }
  // Interpret: typed/spoken words that match no option (simulated recognition)
  {
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
    await ctx.addInitScript(() => {
      class Rec { start() { setTimeout(() => { this.onstart && this.onstart(); setTimeout(() => { const r = Object.assign([{ transcript: window.__t, confidence: 0.9 }], { isFinal: true }); this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.onend && this.onend() }, 100) }, 30) } abort() { this.onend && this.onend() } stop() {} }
      window.webkitSpeechRecognition = Rec; window.SpeechRecognition = Rec
    })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => problems.push(`interp pageerror ${e.message}`))
    await onboard(p, 'English', 0)
    for (let i = 0; i < 3; i++) await primary(p)
    for (const [words, expect] of [['the money I keep for myself', 'claude'], ['mera phone 98765 43210 hai', 'pre:private'], ['should I take a loan to grow?', 'pre:advice']]) {
      await p.evaluate((t) => (window.__t = t), words)
      if (await p.getByTestId('stt-retry').count()) await p.getByTestId('stt-retry').click()
      else await p.getByTestId('stt-mic').click()
      await p.waitForTimeout(900)
      // Since the intent layer (reliability round), personal numbers and advice requests are handled on the
      // device with approved messages and are NEVER forwarded to the AI; only safe non-answers reach Claude.
      if (expect === 'claude') {
        const c = await card(p)
        note(`interpret "${words}": ${JSON.stringify(c)}`)
        if (c.source !== 'claude' || c.permitted !== 'none') problems.push(`interpret ${words}: ${JSON.stringify(c)}`)
      } else {
        const kind = expect === 'pre:private' ? await p.getByTestId('stt-intent').getAttribute('data-kind') : await p.getByTestId('stt-nomatch').getAttribute('data-kind')
        note(`interpret "${words}": handled on device as ${kind} (not sent)`)
        if (kind !== (expect === 'pre:private' ? 'sensitive_information' : 'out_of_scope')) problems.push(`interpret ${words}: ${kind}`)
      }
      if ((await step(p)) !== 'response') problems.push('interpret changed step')
      await p.screenshot({ path: `${SP}/shots/AI-interpret-${expect.replace(':', '-')}.png`, fullPage: true })
    }
    await ctx.close()
  }
  // Coach View "Simpler words": mocked rewording passes the guards and is labelled as AI-reworded.
  {
    const p = await b.newPage({ viewport: { width: 375, height: 812 } })
    await p.goto(BASE + '#/coach/learner/DL-02')
    await p.waitForSelector('[data-testid=rec-simpler]')
    const before = await p.getByTestId('rec-action-text').innerText()
    await p.getByTestId('rec-simpler').click()
    await p.waitForSelector('[data-testid=rec-action-text][data-ai=true]', { timeout: 15000 }).catch(() => problems.push('coach wording not shown'))
    const after = await p.getByTestId('rec-action-text').innerText()
    note(`coach wording: "${before}" → "${after}"`)
    if (after === before || !after.includes('Saraswathi')) problems.push('coach wording unchanged or lost the name')
    await p.getByTestId('why-toggle').click()
    if (!(await p.getByTestId('why-evidence').innerText()).includes('answered “Yes”')) problems.push('evidence changed by AI')
    await p.close()
  }
  const seen = await (await fetch('http://127.0.0.1:8899/__seen')).json()
  note(`mock upstream received ${seen.length} requests: ${JSON.stringify(seen.map((s) => [s.path, s.model, s.format, s.stage, s.auth]))}`)
  if (seen.some((s) => s.words && /98765|loan/.test(s.words))) problems.push('screened words reached the model')
  await b.close()
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL AI BROWSER CHECKS PASSED')
})()

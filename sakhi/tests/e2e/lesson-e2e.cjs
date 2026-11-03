const { chromium } = require('playwright')
const OUT = '' + (process.env.SHOTS_DIR || require('os').tmpdir()) + '/shots'
const BASE = 'http://localhost:4176/'
const problems = []
const log = (m) => console.log(m)

async function check(p, label) {
  const r = await p.evaluate(() => ({
    ow: document.documentElement.scrollWidth > window.innerWidth + 1,
    keys: (document.body.innerText.match(/\{\w+\}|\b(?:fb|ui|bar|intro|example|practice|check|challenge|complete|result|opt|h)\.[a-z_.]+\b/g) || []),
  }))
  if (r.ow) problems.push(`${label}: horizontal overflow`)
  if (r.keys.length) problems.push(`${label}: raw keys ${r.keys.join(',')}`)
}
const step = (p) => p.getByTestId('lesson').getAttribute('data-step')
const primary = (p) => p.getByTestId('primary').first().click()
const opt = (p, id) => p.getByTestId(`option-${id}`).click()
async function shot(p, name) {
  await p.waitForTimeout(120)
  await check(p, name)
  await p.screenshot({ path: `${OUT}/${name}.png` })
}
async function expectStep(p, s, label) {
  const got = await step(p)
  if (got !== s) problems.push(`${label}: expected step ${s}, got ${got}`)
}

;(async () => {
  const b = await chromium.launch()

  // ── Pathway A: PRD demo in English — assessment misconception → corrective → retry → completion
  {
    const p = await b.newPage({ viewport: { width: 375, height: 812 } })
    p.on('pageerror', (e) => problems.push('A pageerror ' + e.message))
    p.on('console', (m) => m.type() === 'error' && problems.push('A console ' + m.text()))
    await p.goto(BASE + '#/onboarding/language')
    await p.locator('main').getByText('English', { exact: true }).click()
    await primary(p)
    await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(0).click() // vegetable
    await primary(p)
    await primary(p) // start assessment
    for (const id of ['yes', 'stock', 'no', 'yes', 'no']) {
      await opt(p, id)
      await primary(p)
      await primary(p)
    }
    const rec = await p.getByTestId('recommendation').getAttribute('data-lesson')
    if (rec !== 'revenue_vs_profit') problems.push('A recommendation ' + rec)
    await shot(p, 'L-A-0-recommendation')
    await p.getByTestId('start-lesson').click()
    await expectStep(p, 'assessment_result', 'A1')
    await shot(p, 'L-A-1-result')
    await primary(p)
    await expectStep(p, 'intro', 'A2')
    await shot(p, 'L-A-2-intro')
    await p.getByTestId('another-way').click()
    await shot(p, 'L-A-2b-intro-another')
    await primary(p)
    await expectStep(p, 'example', 'A3')
    await shot(p, 'L-A-3-example')
    await p.screenshot({ path: `${OUT}/L-A-3-example-full.png`, fullPage: true })
    await primary(p)
    await opt(p, 'sales')
    await primary(p)
    await expectStep(p, 'feedback', 'A5')
    const tone = await p.getByTestId('feedback').getAttribute('data-tone')
    if (tone !== 'corrective') problems.push('A5 tone ' + tone)
    await shot(p, 'L-A-5-corrective')
    await p.getByRole('button', { name: 'Try again' }).click()
    await opt(p, 'left')
    await primary(p)
    await shot(p, 'L-A-5b-positive')
    await primary(p)
    await expectStep(p, 'practice', 'A6')
    await opt(p, 'goods_only')
    await primary(p)
    await shot(p, 'L-A-6-practice-hint')
    await p.getByRole('button', { name: 'Try again' }).click()
    await opt(p, 'profit')
    await primary(p)
    await primary(p)
    await expectStep(p, 'check', 'A7')
    await opt(p, 'down')
    await primary(p)
    await shot(p, 'L-A-7-check')
    await primary(p)
    await expectStep(p, 'challenge', 'A8')
    await shot(p, 'L-A-8-challenge')
    await primary(p)
    await expectStep(p, 'complete', 'A9')
    const res = await p.getByTestId('completion').getAttribute('data-result')
    if (res !== 'developing') problems.push('A9 result ' + res)
    await shot(p, 'L-A-9-complete')
    await primary(p) // Go to Home
    const homeText = await p.locator('main').innerText()
    if (!homeText.includes('This week’s challenge')) problems.push('A home: challenge not pinned')
    await shot(p, 'L-A-10-home')
    log('A done: result ' + res)
    await p.close()
  }

  // ── Pathway B: Telugu, tea stall, all correct
  {
    const p = await b.newPage({ viewport: { width: 375, height: 812 } })
    p.on('pageerror', (e) => problems.push('B pageerror ' + e.message))
    await p.goto(BASE + '#/onboarding/language')
    await p.locator('main').getByText('తెలుగు', { exact: true }).click()
    await primary(p)
    await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(1).click() // tea
    await primary(p)
    await p.goto(BASE + '#/lessons/m1')
    await p.waitForTimeout(200)
    await shot(p, 'L-B-1-result-te')
    await primary(p)
    await primary(p)
    await shot(p, 'L-B-3-example-te')
    await primary(p)
    await opt(p, 'left')
    await primary(p)
    await shot(p, 'L-B-5-positive-te')
    await primary(p)
    await opt(p, 'profit')
    await primary(p)
    await shot(p, 'L-B-6-practice-te')
    await primary(p)
    await opt(p, 'down')
    await primary(p)
    await primary(p)
    await shot(p, 'L-B-8-challenge-te')
    await primary(p)
    const res = await p.getByTestId('completion').getAttribute('data-result')
    if (res !== 'understood') problems.push('B result ' + res)
    await shot(p, 'L-B-9-complete-te')
    log('B done: result ' + res)
    await p.close()
  }

  // ── Pathway C: Hindi grocery, resume after reload mid-lesson
  {
    const p = await b.newPage({ viewport: { width: 375, height: 812 } })
    p.on('pageerror', (e) => problems.push('C pageerror ' + e.message))
    await p.goto(BASE + '#/onboarding/language')
    await p.locator('main').getByText('हिन्दी', { exact: true }).click()
    await primary(p)
    await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(2).click() // grocery
    await primary(p)
    await p.goto(BASE + '#/lessons/m1')
    await primary(p)
    await primary(p)
    await shot(p, 'L-C-3-example-hi')
    await primary(p)
    await opt(p, 'sales')
    await primary(p)
    await shot(p, 'L-C-5-corrective-hi')
    await p.reload()
    await p.waitForTimeout(300)
    await shot(p, 'L-C-resume-hi')
    await p.getByTestId('primary').first().click() // resume
    await expectStep(p, 'feedback', 'C resume')
    log('C done')
    await p.close()
  }

  await b.close()
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL BROWSER CHECKS PASSED')
})()

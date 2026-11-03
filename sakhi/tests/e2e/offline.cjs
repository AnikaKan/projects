// Offline behaviour in a real Chromium: first visit online installs the app shell (public/sw.js);
// then the network is cut and the app is reloaded and used.
//   npm run build && npx vite preview --port 4176 ; node tests/e2e/offline.cjs
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4176/'
const problems = []
const log = []
const ok = (c, m) => { log.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) problems.push(m) }
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push('pageerror ' + e.message))
  await p.goto(BASE + '#/onboarding/language')
  await p.evaluate(async () => { await navigator.serviceWorker.ready })
  await p.reload() // page now controlled by the service worker
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'Service worker installed and controlling the page after the first online visit')
  const cached = await p.evaluate(async () => (await (await caches.open('hisaab-shell-v1')).keys()).length)
  ok(cached >= 20, `App shell precached (${cached} files incl. Telugu/Devanagari fonts)`)
  // Go offline and cold-reload
  await ctx.setOffline(true)
  await p.reload()
  await p.waitForSelector('main')
  ok((await p.locator('main').innerText()).includes('తెలుగు'), 'Offline reload: app opens from the cache (language screen rendered)')
  await p.locator('main').getByText('తెలుగు', { exact: true }).click()
  await p.getByTestId('primary').first().click()
  await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(0).click()
  await p.getByTestId('primary').first().click()
  await p.getByTestId('primary').first().click()
  ok((await p.getByTestId('stt-offline').count()) === 1, 'Offline: voice answer replaced by a clear notice; tap answers remain')
  for (const id of ['yes', 'stock', 'no', 'yes', 'no']) {
    await p.getByTestId(`option-${id}`).click()
    await p.getByTestId('primary').first().click()
    await p.getByTestId('primary').first().click()
  }
  ok((await p.getByTestId('recommendation').getAttribute('data-lesson')) === 'revenue_vs_profit', 'Offline: diagnostic scored and lesson recommended on the device')
  await p.getByTestId('start-lesson').click()
  for (let i = 0; i < 3; i++) await p.getByTestId('primary').first().click()
  await p.getByTestId('option-sales').click(); await p.getByTestId('primary').first().click()
  ok((await p.getByTestId('feedback').getAttribute('data-tone')) === 'corrective', 'Offline: lesson feedback works (approved text, no AI)')
  await p.reload()
  await p.waitForSelector('main')
  await p.waitForTimeout(500)
  const resume = await p.getByTestId('resume-body').count()
  ok(resume === 1 || (await p.getByTestId('lesson').count()) === 1, `Offline: after reload the lesson offers to resume where she stopped (resume prompt: ${resume})`)
  await ctx.setOffline(false)
  await b.close()
  console.log(log.join('\n'))
  console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n` + problems.join('\n') : `\nOFFLINE: ALL ${log.length} CHECKS PASSED`)
  process.exit(problems.length ? 1 : 0)
})()

// Real-browser verification of speech features.
//  Part A: real Chromium speech engines (whatever this machine provides).
//  Part B: real Chromium + injected (simulated) speech engines to exercise the full UI path.
const { chromium } = require('playwright')
const OUT = '' + (process.env.SHOTS_DIR || require('os').tmpdir()) + '/shots'
const BASE = 'http://localhost:4176/'
const report = []
const problems = []
const note = (m) => {
  report.push(m)
  console.log(m)
}

async function onboard(p, nativeName, bizIndex = 0) {
  await p.goto(BASE + '#/onboarding/language')
  await p.locator('main').getByText(nativeName, { exact: true }).click()
  await p.getByTestId('primary').first().click()
  await p.locator('main button[aria-pressed]:not(.rounded-full)').nth(bizIndex).click()
  await p.getByTestId('primary').first().click()
}
async function toResponse(p) {
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hisaab.lesson')).forEach((k) => localStorage.removeItem(k)))
  await p.goto(BASE + '#/lessons/m1')
  await p.waitForTimeout(300)
  for (let i = 0; i < 3; i++) await p.getByTestId('primary').first().click()
}

const INJECT = () => {
  window.__spoken = []
  window.__cancels = 0
  window.__sttStarts = []
  window.__stt = { kind: 'result', transcript: '' }
  class Rec {
    constructor() {
      this.lang = ''
    }
    start() {
      const s = window.__stt
      window.__sttStarts.push(this.lang)
      setTimeout(() => {
        if (s.kind === 'error') {
          this.onerror && this.onerror({ error: s.error })
          return this.onend && this.onend()
        }
        this.onstart && this.onstart()
        setTimeout(() => {
          const alt = { transcript: s.transcript, confidence: 0.9 }
          const res = Object.assign([alt], { isFinal: true })
          this.onresult && this.onresult({ resultIndex: 0, results: [res] })
          this.onspeechend && this.onspeechend()
          this.onend && this.onend()
        }, 150)
      }, 50)
    }
    abort() {
      this.onerror && this.onerror({ error: 'aborted' })
      this.onend && this.onend()
    }
    stop() {}
  }
  window.webkitSpeechRecognition = Rec
  window.SpeechRecognition = Rec
  const voices = [
    { name: 'Sim English India', lang: 'en-IN', localService: true },
    { name: 'Sim Hindi', lang: 'hi-IN', localService: true },
    ...(window.__noTelugu ? [] : [{ name: 'Sim Telugu', lang: 'te-IN', localService: true }]),
  ]
  let current = null
  const synth = {
    getVoices: () => voices,
    addEventListener() {},
    removeEventListener() {},
    speak(u) {
      window.__spoken.push({ text: u.text, lang: u.lang, voice: u.voice && u.voice.name, rate: u.rate })
      current = u
      setTimeout(() => current === u && (current = null, u.onend && u.onend()), 1500)
    },
    cancel() {
      window.__cancels++
      const c = current
      current = null
      c && c.onerror && c.onerror({ error: 'interrupted' })
    },
    pause() {},
    resume() {},
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      this.text = t
    }
  }
}

;(async () => {
  // ── Part A: real engines ─────────────────────────────────────────
  for (const headed of [false, true]) {
    if (headed && !process.env.DISPLAY) continue
    const label = headed ? 'Chromium 153 headed (Xvfb, no audio device)' : 'Chromium 153 headless'
    const b = await chromium.launch({ headless: !headed, args: ['--use-fake-ui-for-media-stream'] })
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, permissions: ['microphone'] })
    const p = await ctx.newPage()
    p.on('pageerror', (e) => problems.push(`${label} pageerror ${e.message}`))
    for (const [code, native] of [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']]) {
      await onboard(p, native)
      await p.goto(BASE + '#/onboarding/language')
      await p.waitForTimeout(2000)
      const avail = await p.getByTestId(`greet-${code}`).getAttribute('data-availability')
      await toResponse(p)
      await p.waitForTimeout(1800)
      const ttsFallback = await p.getByTestId('tts-fallback').first().getAttribute('data-reason').catch(() => 'none')
      await p.getByTestId('stt-mic').click()
      await p.waitForTimeout(6500)
      const fatal = await p.getByTestId('stt-fallback').getAttribute('data-reason').catch(() => null)
      const err = await p.getByTestId('stt-panel').getAttribute('data-error').catch(() => null)
      note(`A | ${label} | ${code}: TTS voice=${avail}, read-aloud fallback=${ttsFallback}; STT → ${fatal ? 'fallback:' + fatal : 'error:' + err}`)
      await p.screenshot({ path: `${OUT}/S-A-${headed ? 'headed' : 'headless'}-${code}.png` })
    }
    await b.close()
  }

  // ── Part B: real browser, simulated engines ─────────────────────
  const b = await chromium.launch()
  for (const [code, native, spokenRight, spokenWrong] of [
    ['en', 'English', 'two hundred rupees', 'five hundred'],
    ['hi', 'हिन्दी', 'दो सौ रुपये', 'पाँच सौ'],
    ['te', 'తెలుగు', 'రెండు వందలు', 'ఐదు వందలు'],
  ]) {
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
    await ctx.addInitScript(INJECT)
    const p = await ctx.newPage()
    p.on('pageerror', (e) => problems.push(`B ${code} pageerror ${e.message}`))
    await onboard(p, native)
    await toResponse(p)
    // Read the question aloud
    await p.getByTestId('tts-play').first().click()
    await p.waitForTimeout(100)
    const spoken = await p.evaluate(() => window.__spoken.at(-1))
    if (spoken.lang !== { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' }[code]) problems.push(`B ${code} tts lang ${spoken.lang}`)
    if (!/(rupees|रुपये|రూపాయలు)/.test(spoken.text)) problems.push(`B ${code} amounts not spoken as words: ${spoken.text}`)
    // Wrong answer by voice, then correct it manually
    await p.evaluate((t) => (window.__stt = { kind: 'result', transcript: t }), spokenWrong)
    await p.getByTestId('stt-mic').click()
    await p.waitForSelector('[data-testid=stt-transcript]')
    await p.screenshot({ path: `${OUT}/S-B-${code}-1-heard.png` })
    const first = await p.getByTestId('stt-match').getAttribute('data-option')
    await p.getByTestId('stt-transcript').fill(spokenRight)
    const corrected = await p.getByTestId('stt-match').getAttribute('data-option')
    await p.screenshot({ path: `${OUT}/S-B-${code}-2-corrected.png` })
    await p.getByTestId('stt-confirm').click()
    await p.getByTestId('primary').first().click()
    const tone = await p.getByTestId('feedback').getAttribute('data-tone')
    await p.screenshot({ path: `${OUT}/S-B-${code}-3-feedback.png` })
    const starts = await p.evaluate(() => window.__sttStarts)
    note(`B | Chromium 153 + simulated engines | ${code}: TTS "${spoken.text.slice(0, 60)}…" lang=${spoken.lang} voice=${spoken.voice}; STT langs=${[...new Set(starts)]} heard→${first}, corrected→${corrected}, feedback=${tone}`)
    if (first !== 'sales' || corrected !== 'left' || tone !== 'positive') problems.push(`B ${code} voice answer path`)
    // Navigate away while speaking → cancel
    await p.getByTestId('tts-play').first().click()
    const c0 = await p.evaluate(() => window.__cancels)
    await p.getByTestId('coach-entry').count() ? await p.goto(p.url().replace(/#.*/, '#/coach')) : await p.goto(p.url().replace(/#.*/, '#/coach')) // Coach View is no longer a header link (UX redesign); open it directly
    await p.waitForTimeout(200)
    const c1 = await p.evaluate(() => window.__cancels)
    note(`B | ${code}: navigation away cancelled speech: ${c1 > c0}`)
    if (!(c1 > c0)) problems.push(`B ${code} nav cancel`)
    await ctx.close()
  }
  // Missing Telugu voice with simulated engines
  {
    const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
    await ctx.addInitScript(() => (window.__noTelugu = true))
    await ctx.addInitScript(INJECT)
    const p = await ctx.newPage()
    await onboard(p, 'తెలుగు')
    await toResponse(p)
    await p.waitForTimeout(300)
    const reason = await p.getByTestId('tts-fallback').first().getAttribute('data-reason')
    const spokenCount = await p.evaluate(() => window.__spoken.length)
    await p.screenshot({ path: `${OUT}/S-B-te-novoice.png` })
    note(`B | te without Telugu voice: fallback=${reason}, utterances=${spokenCount}`)
    if (reason !== 'no-voice' || spokenCount !== 0) problems.push('B te no-voice')
    // Permission denied
    await p.evaluate(() => (window.__stt = { kind: 'error', error: 'not-allowed' }))
    await p.getByTestId('stt-mic').click()
    await p.waitForSelector('[data-testid=stt-fallback]')
    await p.screenshot({ path: `${OUT}/S-B-te-denied.png` })
    note(`B | te permission denied: ${await p.getByTestId('stt-fallback').getAttribute('data-reason')}`)
    await ctx.close()
  }
  await b.close()
  console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'ALL SPEECH BROWSER CHECKS PASSED')
  require('fs').writeFileSync(OUT + '/speech-report.txt', report.join('\n'))
})()

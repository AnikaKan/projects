// Client-side Sarvam integration tests. Network, microphone and audio playback are faked;
// these tests prove our wiring and fallbacks, NOT Sarvam's recognition or voice quality.
import { describe, expect, it } from 'vitest'
import { toSarvamSpeakable, indianGrouping } from '../sarvamText'
import { downmix, encodeWavPcm16, resample } from '../wav'
import { SarvamClient, SarvamClientError, type AudioCacheLike } from '../SarvamClient'
import { HybridStt, HybridTts, SarvamSttService, SarvamTtsService, type AudioPlayerLike } from '../SarvamServices'
import { CaptureError, type AudioCapture } from '../audioCapture'
import { SttError } from '../SpeechRecognitionService'
import { matchSpokenAnswer } from '../answerMatching'
import { RecognitionHarness, SynthHarness, V, flush } from './fakes'

// ── fakes ──
class MemCache implements AudioCacheLike {
  m = new Map<string, Blob>()
  async match(k: string) {
    return this.m.get(k) ?? null
  }
  async put(k: string, b: Blob) {
    this.m.set(k, b)
  }
}
interface Call {
  url: string
  init?: RequestInit
}
function backend(opts: { configured?: boolean; tts?: number; stt?: number; transcript?: string; manifest?: Record<string, string> } = {}) {
  const calls: Call[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    if (url.endsWith('/status')) return new Response(JSON.stringify({ configured: opts.configured ?? true, tts: { model: 'bulbul:v3', speakers: { 'hi-IN': 'priya' } } }))
    if (url === '/audio/manifest.json') return opts.manifest ? new Response(JSON.stringify({ entries: opts.manifest })) : new Response('{}', { status: 404 })
    if (url.startsWith('/audio/')) return new Response(new Blob(['shipped-audio'], { type: 'audio/mpeg' }))
    if (url.endsWith('/tts')) {
      const st = opts.tts ?? 200
      return st === 200 ? new Response(new Blob(['sarvam-audio'], { type: 'audio/mpeg' })) : new Response(JSON.stringify({ error: st === 503 ? 'not_configured' : 'x' }), { status: st })
    }
    if (url.includes('/stt')) {
      const st = opts.stt ?? 200
      return st === 200 ? new Response(JSON.stringify({ transcript: opts.transcript ?? 'दो सौ रुपये', languageCode: 'hi-IN' })) : new Response(JSON.stringify({ error: 'x' }), { status: st })
    }
    return new Response('', { status: 404 })
  }
  return { calls, fetcher }
}
class FakePlayer implements AudioPlayerLike {
  played: string[] = []
  hold = false
  private end: (() => void) | null = null
  paused = 0
  play(blob: Blob, onEnd: () => void) {
    blob.text().then((t) => this.played.push(t))
    this.end = onEnd
    if (!this.hold) setTimeout(() => this.end?.(), 0)
  }
  finish() {
    this.end?.()
  }
  pause() {
    this.paused++
  }
  resume() {}
  stop() {
    this.end = null
  }
}
class FakeCapture implements AudioCapture {
  result: 'ok' | CaptureError = 'ok'
  aborted = 0
  isSupported() {
    return true
  }
  async record(o: { onStart?: () => void } = {}) {
    o.onStart?.()
    if (this.result !== 'ok') throw this.result
    return { samples: new Float32Array(48000).fill(0.1), sampleRate: 48000 }
  }
  abort() {
    this.aborted++
  }
}
const client = (b: ReturnType<typeof backend>, online = true, cache = new MemCache()) => new SarvamClient({ fetcher: b.fetcher, cache, isOnline: () => online })

describe('text prepared for Sarvam Bulbul', () => {
  it('reads rupee amounts with Indian grouping and pauses around operators', () => {
    expect(toSarvamSpeakable('₹1500 − ₹300 = ₹1,200', 'en')).toBe('1,500 rupees, minus 300 rupees, equals 1,200 rupees')
    expect(toSarvamSpeakable('लाभ: ₹500 − ₹300 = ₹200।', 'hi')).toBe('लाभ: 500 रुपये, घटा 300 रुपये, बराबर 200 रुपये।')
    expect(toSarvamSpeakable('అమ్మకాలు (sales) ₹1,50,000', 'te')).toBe('అమ్మకాలు sales 1,50,000 రూపాయలు')
    expect(indianGrouping(150000)).toBe('1,50,000')
  })
})

describe('16 kHz mono WAV for Sarvam STT', () => {
  it('resamples, downmixes and writes a valid PCM16 header', () => {
    const mono = downmix([new Float32Array([1, 1]), new Float32Array([0, 0])])
    expect([...mono]).toEqual([0.5, 0.5])
    const s = resample(new Float32Array(48000), 48000)
    expect(s.length).toBe(16000)
    const wav = new DataView(encodeWavPcm16(s))
    const tag = (o: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(o + i)))
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(wav.getUint16(22, true)).toBe(1) // mono
    expect(wav.getUint32(24, true)).toBe(16000)
    expect(wav.getUint16(34, true)).toBe(16) // bits
    expect(wav.byteLength).toBe(44 + 16000 * 2)
  })
})

describe('SarvamClient (talks only to our backend)', () => {
  it('sends text, BCP-47 language, pace and cache flag to /api/speech/tts', async () => {
    const b = backend()
    await client(b).tts('hi', '200 रुपये', 0.9, { cacheable: true })
    const call = b.calls.find((c) => c.url === '/api/speech/tts')!
    expect(JSON.parse(String(call.init!.body))).toEqual({ text: '200 रुपये', lang: 'hi-IN', pace: 0.9, cache: true })
    expect(b.calls.every((c) => !c.url.includes('sarvam.ai'))).toBe(true)
  })

  it('caches standard audio for offline replay; personal text is never cached', async () => {
    const b = backend()
    const cache = new MemCache()
    const online = client(b, true, cache)
    await online.tts('te', 'లాభం 270 రూపాయలు', 0.9, { cacheable: true })
    await online.tts('en', 'Namaste, Lakshmi', 0.9, { cacheable: false })
    expect(cache.m.size).toBe(1)
    const offline = client(b, false, cache)
    expect((await offline.tts('te', 'లాభం 270 రూపాయలు', 0.9, { cacheable: true })).fromCache).toBe(true)
    await expect(offline.tts('en', 'Namaste, Lakshmi', 0.9, { cacheable: false })).rejects.toMatchObject({ code: 'offline' })
  })

  it('uses pre-generated lesson audio from the manifest when present', async () => {
    const { audioKey } = await import('../SarvamClient')
    const key = await audioKey('hi', 0.9, 'आपका मुनाफ़ा 200 रुपये')
    const b = backend({ manifest: { [key]: `${key}.mp3` } })
    const r = await client(b, false).tts('hi', 'आपका मुनाफ़ा 200 रुपये', 0.9, { cacheable: true })
    expect(r.fromCache).toBe(true)
    expect(await r.blob.text()).toBe('shipped-audio')
  })

  it.each([
    [503, 'not_configured'],
    [429, 'rate_limited'],
    [402, 'no_credits'],
    [500, 'upstream'],
  ])('backend %i → %s', async (st, code) => {
    await expect(client(backend({ tts: st })).tts('en', 'x', 0.9, { cacheable: false })).rejects.toMatchObject({ code })
  })

  it('posts 16 kHz WAV to /api/speech/stt with the selected language', async () => {
    const b = backend({ transcript: 'రెండు వందలు' })
    const r = await client(b).stt('te', encodeWavPcm16(new Float32Array(1600)))
    expect(r.transcript).toBe('రెండు వందలు')
    const call = b.calls.find((c) => c.url.includes('/stt'))!
    expect(call.url).toBe('/api/speech/stt?lang=te-IN')
    expect((call.init!.headers as Record<string, string>)['Content-Type']).toBe('audio/wav')
  })
})

describe('SarvamTtsService', () => {
  it('plays Sarvam audio, reports engine and latency, supports pause and stop', async () => {
    const player = new FakePlayer()
    player.hold = true
    const tts = new SarvamTtsService(client(backend()), player)
    const p = tts.speak('मुनाफ़ा ₹200', 'hi', { owner: 'a' })
    await flush()
    await flush()
    expect(tts.getState()).toEqual({ state: 'speaking', owner: 'a' })
    tts.pause()
    expect(tts.getState().state).toBe('paused')
    tts.resume()
    player.finish()
    const r = await p
    expect(r).toMatchObject({ ok: true, engine: 'sarvam' })
    expect(typeof r.latencyMs).toBe('number')
    expect(player.played).toEqual(['sarvam-audio'])
  })

  it('slow playback uses Sarvam pace 0.7 (normal 0.9)', async () => {
    const b = backend()
    const tts = new SarvamTtsService(client(b), new FakePlayer())
    await tts.speak('a', 'en', { slow: true })
    await tts.speak('b', 'en')
    const paces = b.calls.filter((c) => c.url.endsWith('/tts')).map((c) => JSON.parse(String(c.init!.body)).pace)
    expect(paces).toEqual([0.7, 0.9])
  })
})

describe('SarvamSttService', () => {
  it('records only after listen(), converts to 16 kHz WAV, returns the transcript for confirmation', async () => {
    const b = backend({ transcript: '  दो सौ रुपये ' })
    const stt = new SarvamSttService(client(b), new FakeCapture())
    const r = await stt.listen('hi')
    expect(r).toMatchObject({ transcript: 'दो सौ रुपये', lang: 'hi-IN', engine: 'sarvam' })
    const body = b.calls.find((c) => c.url.includes('/stt'))!.init!.body as ArrayBuffer
    expect(new DataView(body).getUint32(24, true)).toBe(16000)
    expect(body.byteLength).toBe(44 + 16000 * 2) // 1 s at 48 kHz → 1 s at 16 kHz
  })

  it.each([
    [new CaptureError('permission-denied'), 'permission-denied'],
    [new CaptureError('audio-capture'), 'audio-capture'],
    [new CaptureError('no-speech'), 'no-speech'],
  ])('microphone problem → %s', async (err, code) => {
    const cap = new FakeCapture()
    cap.result = err
    await expect(new SarvamSttService(client(backend()), cap).listen('en')).rejects.toMatchObject({ code })
  })

  it('offline → network error without touching the microphone; empty transcript → no-match', async () => {
    const cap = new FakeCapture()
    await expect(new SarvamSttService(client(backend(), false), cap).listen('te')).rejects.toMatchObject({ code: 'network' })
    await expect(new SarvamSttService(client(backend({ transcript: ' ' })), cap).listen('te')).rejects.toMatchObject({ code: 'no-match' })
  })
})

describe('Hybrid engines: Sarvam first, browser speech as fallback', () => {
  const browserTts = () => new SynthHarness([V.enIN, V.hiIN, V.teIN])
  const mk = (b: ReturnType<typeof backend>, pref: 'auto' | 'browser' | 'sarvam' = 'auto', online = true) => {
    const c = client(b, online)
    const synth = browserTts()
    const player = new FakePlayer()
    return { tts: new HybridTts(new SarvamTtsService(c, player), synth.service(), c, () => pref), synth, player }
  }

  it('backend not configured → browser voice', async () => {
    const { tts, synth } = mk(backend({ configured: false }))
    expect(await tts.speak('नमस्ते', 'hi')).toMatchObject({ ok: true, engine: 'browser' })
    expect(synth.spoken[0].lang).toBe('hi-IN')
  })

  it('configured → Sarvam voice', async () => {
    const { tts, synth, player } = mk(backend())
    expect(await tts.speak('నమస్తే', 'te')).toMatchObject({ ok: true, engine: 'sarvam' })
    expect(synth.spoken).toEqual([])
    expect(player.played).toEqual(['sarvam-audio'])
    expect((await tts.voiceFor('te'))?.name).toContain('Sarvam')
  })

  it('Sarvam failure → same request falls back to browser, and Sarvam rests for a minute', async () => {
    const b = backend({ tts: 500 })
    const { tts, synth } = mk(b)
    expect(await tts.speak('Your profit is ₹200', 'en')).toMatchObject({ ok: true, engine: 'browser' })
    expect(synth.spoken[0].text).toBe('Your profit is 200 rupees')
    const before = b.calls.length
    await tts.speak('Again', 'en')
    expect(b.calls.slice(before).some((c) => c.url.endsWith('/tts'))).toBe(false)
  })

  it('preference "browser" never calls Sarvam; preference "sarvam" never uses the browser voice', async () => {
    const b1 = backend()
    const a = mk(b1, 'browser')
    await a.tts.speak('x', 'en')
    expect(b1.calls.some((c) => c.url.endsWith('/tts'))).toBe(false)
    const s = mk(backend({ configured: false }), 'sarvam')
    expect(await s.tts.speak('x', 'en')).toMatchObject({ ok: false, reason: 'no-voice' })
    expect(s.synth.spoken).toEqual([])
  })

  it('offline: cached lesson audio still plays via Sarvam cache; otherwise the phone voice', async () => {
    const cache = new MemCache()
    const b = backend()
    await new SarvamTtsService(client(b, true, cache), new FakePlayer()).speak('Your profit is ₹200.', 'en')
    const c = client(b, false, cache)
    const synth = browserTts()
    const tts = new HybridTts(new SarvamTtsService(c, new FakePlayer()), synth.service(), c, () => 'auto')
    expect(await tts.speak('Your profit is ₹200.', 'en')).toMatchObject({ ok: true, engine: 'cached' })
    expect(await tts.speak('Something new', 'en')).toMatchObject({ ok: true, engine: 'browser' })
  })

  it('STT: configured → Sarvam; a server failure makes the next press use browser recognition', async () => {
    const b = backend({ stt: 500 })
    const c = client(b)
    const rec = new RecognitionHarness()
    rec.script = { kind: 'result', transcript: 'two hundred' }
    const stt = new HybridStt(new SarvamSttService(c, new FakeCapture()), rec.service(), c, () => 'auto')
    await expect(stt.listen('en')).rejects.toBeInstanceOf(SttError)
    expect(rec.started).toEqual([])
    const r = await stt.listen('en')
    expect(r).toMatchObject({ transcript: 'two hundred', engine: 'browser' })
    expect(rec.started[0].lang).toBe('en-IN')
  })

  it('STT preference "sarvam" with no backend → unsupported (UI shows tap answers), never English browser fallback', async () => {
    const c = client(backend({ configured: false }))
    const rec = new RecognitionHarness()
    const stt = new HybridStt(new SarvamSttService(c, new FakeCapture()), rec.service(), c, () => 'sarvam')
    await expect(stt.listen('te')).rejects.toMatchObject({ code: 'unsupported' })
    expect(rec.started).toEqual([])
  })
})

describe('financial amounts in Sarvam-style transcripts (synthetic strings, not real recognition)', () => {
  // Saaras "transcribe" mode applies number normalisation (digits); "verbatim" keeps spoken words.
  const opts = [
    { id: 'left', label: '₹200', amount: 200 },
    { id: 'sales', label: '₹500', amount: 500 },
  ]
  it.each([
    ['en', '200 rupees', 'left'],
    ['hi', '200 रुपये', 'left'],
    ['hi', 'दो सौ रुपये', 'left'],
    ['te', '500 రూపాయలు', 'sales'],
    ['te', 'ఐదు వందల రూపాయలు', 'sales'],
    ['hi', 'profit 200 rupees है', 'left'], // code-mixed
    ['te', 'profit రెండు వందలు', 'left'], // code-mixed
  ] as const)('%s “%s” → %s', (lang, transcript, id) => {
    expect(matchSpokenAnswer(transcript, lang, opts)).toMatchObject({ status: 'match', optionId: id })
  })
})

describe('client error codes', () => {
  it('SarvamClientError codes are stable', () => {
    expect(new SarvamClientError('offline').code).toBe('offline')
  })
})

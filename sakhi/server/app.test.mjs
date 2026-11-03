// Backend tests with a mocked Sarvam (no network, fictional data).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSpeechApp } from './app.mjs'
import { mapUpstreamStatus } from './sarvam.mjs'

const KEY = 'test-key-not-real'
const logs = []
const calls = []
let upstream = { status: 200, json: {} }

const fakeFetch = async (url, init) => {
  const entry = { url, headers: init.headers, body: init.body }
  if (init.body instanceof FormData) entry.form = Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `blob:${v.type}:${v.size}`]))
  else entry.json = JSON.parse(init.body)
  calls.push(entry)
  return { ok: upstream.status < 300, status: upstream.status, json: async () => upstream.json }
}

function start(env, cacheDir = null) {
  const server = createServer(createSpeechApp({ env, fetchImpl: fakeFetch, log: (e) => logs.push(e), cacheDir }))
  return new Promise((r) => server.listen(0, () => r({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

const wav = (bytes = 3200) => {
  const b = Buffer.alloc(44 + bytes)
  b.write('RIFF', 0)
  return b
}

let s, base, cacheDir, bare
beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), 'tts-'))
  ;({ server: s, base } = await start({ SARVAM_API_KEY: KEY }, cacheDir))
  bare = await start({})
})
afterAll(() => {
  s.close()
  bare.server.close()
  rmSync(cacheDir, { recursive: true, force: true })
})

describe('configuration & secrets', () => {
  it('status never exposes the key', async () => {
    const r = await (await fetch(`${base}/api/speech/status`)).json()
    expect(r).toMatchObject({ configured: true, provider: 'sarvam', stt: { model: 'saaras:v3', mode: 'transcribe' }, tts: { model: 'bulbul:v3', speakers: { 'en-IN': 'ishita', 'hi-IN': 'priya', 'te-IN': 'neha' } } })
    expect(JSON.stringify(r)).not.toContain(KEY)
  })

  it('without a key the speech routes answer 503 not_configured (app falls back to browser speech)', async () => {
    expect((await (await fetch(`${bare.base}/api/speech/status`)).json()).configured).toBe(false)
    const r = await fetch(`${bare.base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'x', lang: 'hi-IN' }) })
    expect(r.status).toBe(503)
    expect(await r.json()).toEqual({ error: 'not_configured' })
  })
})

describe('speech-to-text proxy', () => {
  it('forwards the documented fields with the key in api-subscription-key', async () => {
    upstream = { status: 200, json: { request_id: 'r1', transcript: 'दो सौ रुपये', language_code: 'hi-IN' } }
    calls.length = 0
    const r = await fetch(`${base}/api/speech/stt?lang=hi-IN`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav() })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ transcript: 'दो सौ रुपये', languageCode: 'hi-IN' })
    expect(calls[0].url).toBe('https://api.sarvam.ai/speech-to-text')
    expect(calls[0].headers['api-subscription-key']).toBe(KEY)
    expect(calls[0].form).toEqual({ file: 'blob:audio/wav:3244', model: 'saaras:v3', mode: 'transcribe', language_code: 'hi-IN' })
  })

  it.each(['en-IN', 'hi-IN', 'te-IN'])('accepts %s', async (lang) => {
    upstream = { status: 200, json: { transcript: 'ok' } }
    expect((await fetch(`${base}/api/speech/stt?lang=${lang}`, { method: 'POST', body: wav() })).status).toBe(200)
  })

  it('rejects other languages, empty and oversized audio before calling Sarvam', async () => {
    calls.length = 0
    expect((await fetch(`${base}/api/speech/stt?lang=ta-IN`, { method: 'POST', body: wav() })).status).toBe(400)
    expect((await fetch(`${base}/api/speech/stt?lang=hi-IN`, { method: 'POST', body: Buffer.alloc(10) })).status).toBe(400)
    const big = await fetch(`${base}/api/speech/stt?lang=hi-IN`, { method: 'POST', body: Buffer.alloc(3 * 1024 * 1024) }).catch(() => ({ status: 413 }))
    expect(big.status).toBe(413)
    expect(calls).toHaveLength(0)
  })

  it.each([
    [403, 'upstream_auth', 403],
    [402, 'no_credits', 402],
    [429, 'rate_limited', 429],
    [503, 'upstream_unavailable', 502],
  ])('upstream %i → %s', async (st, code) => {
    upstream = { status: st, json: { error: { code: 'x', message: 'secret transcript should not leak' } } }
    const r = await fetch(`${base}/api/speech/stt?lang=te-IN`, { method: 'POST', body: wav() })
    expect((await r.json()).error).toBe(code)
    expect(mapUpstreamStatus(st)).toBe(code)
  })

  it('logs metadata only — never transcripts, text or audio', async () => {
    logs.length = 0
    upstream = { status: 200, json: { transcript: 'ఐదు వందలు SECRET' } }
    await fetch(`${base}/api/speech/stt?lang=te-IN`, { method: 'POST', body: wav() })
    upstream = { status: 200, json: { audios: [Buffer.from('ID3fake').toString('base64')] } }
    await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'PRIVATE TEXT ₹200', lang: 'te-IN' }) })
    const dump = JSON.stringify(logs)
    expect(dump).not.toContain('SECRET')
    expect(dump).not.toContain('PRIVATE')
    expect(dump).not.toContain(KEY)
    expect(Object.keys(logs[0]).sort()).toEqual(['bytesIn', 'lang', 'ms', 'route', 'status', 'upstreamMs'])
  })
})

describe('text-to-speech proxy', () => {
  it('sends the documented body and returns decoded audio', async () => {
    calls.length = 0
    upstream = { status: 200, json: { request_id: 'r2', audios: [Buffer.from('ID3-audio-bytes').toString('base64')] } }
    const r = await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'आपका मुनाफ़ा 200 रुपये है।', lang: 'hi-IN', pace: 0.8 }) })
    expect(r.headers.get('content-type')).toBe('audio/mpeg')
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe('ID3-audio-bytes')
    expect(calls[0].url).toBe('https://api.sarvam.ai/text-to-speech')
    expect(calls[0].json).toEqual({
      text: 'आपका मुनाफ़ा 200 रुपये है।',
      language_code: 'hi-IN',
      model: 'bulbul:v3',
      speaker: 'priya',
      pace: 0.8,
      speech_sample_rate: 22050,
      output_audio_codec: 'mp3',
    })
  })

  it('validates pace (0.5–2.0), text length (≤2500) and speaker allow-list', async () => {
    calls.length = 0
    expect((await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'x', lang: 'en-IN', pace: 3 }) })).status).toBe(400)
    expect((await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'x'.repeat(2501), lang: 'en-IN' }) })).status).toBe(400)
    expect(calls).toHaveLength(0)
    upstream = { status: 200, json: { audios: [Buffer.from('a').toString('base64')] } }
    await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'x', lang: 'en-IN', speaker: 'not-a-voice' }) })
    expect(calls[0].json.speaker).toBe('ishita')
    await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'x', lang: 'te-IN', speaker: 'shubh' }) })
    expect(calls[1].json.speaker).toBe('shubh')
  })

  it('caches standard lesson audio only when asked; personal text is never written to disk', async () => {
    calls.length = 0
    upstream = { status: 200, json: { audios: [Buffer.from('cached-audio').toString('base64')] } }
    const body = JSON.stringify({ text: 'మీ లాభం 270 రూపాయలు.', lang: 'te-IN', cache: true })
    const a = await fetch(`${base}/api/speech/tts`, { method: 'POST', body })
    const b = await fetch(`${base}/api/speech/tts`, { method: 'POST', body })
    expect([a.headers.get('x-tts-cache'), b.headers.get('x-tts-cache')]).toEqual(['miss', 'hit'])
    expect(calls).toHaveLength(1)
    expect(Buffer.from(await b.arrayBuffer()).toString()).toBe('cached-audio')
    const before = readdirSync(cacheDir).length
    await fetch(`${base}/api/speech/tts`, { method: 'POST', body: JSON.stringify({ text: 'Namaste, Lakshmi', lang: 'en-IN' }) })
    expect(readdirSync(cacheDir).length).toBe(before)
  })
})

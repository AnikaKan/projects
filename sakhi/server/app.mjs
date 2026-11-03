// Minimal backend: keeps the Sarvam and Anthropic API keys on the server; proxies STT/TTS and AI explanations.
// Privacy: request bodies (audio, text, transcripts) are never logged or written to disk,
// except TTS audio for STANDARD lesson text when the client marks it cacheable.

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { BULBUL_V3_SPEAKERS, LANGUAGE_CODES, loadConfig, SarvamError, synthesize, transcribe } from './sarvam.mjs'
import { createExplainHandler } from './explain/handler.mjs'
import { createCoachWordingHandler } from './coach/wording.mjs'

const MAX_AUDIO_BYTES = 2 * 1024 * 1024 // ~60 s of 16 kHz mono WAV; Sarvam sync REST accepts ≤ 30 s
const MAX_JSON_BYTES = 16 * 1024
export const ttsCacheKey = (model, speaker, lang, pace, text) => createHash('sha256').update(`${model}|${speaker}|${lang}|${pace}|${text}`).digest('hex')

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new SarvamError('too_large', 413))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

/**
 * @param {{ env?: Record<string,string|undefined>, fetchImpl?: typeof fetch, claudeFetchImpl?: typeof fetch, log?: (entry: object) => void, cacheDir?: string|null, staticDir?: string|null }} opts
 * fetchImpl is used for Sarvam; claudeFetchImpl is handed to the official Anthropic SDK (tests only).
 */
export function createSpeechApp(opts = {}) {
  const config = loadConfig(opts.env ?? process.env)
  const log = opts.log ?? ((e) => console.log(JSON.stringify(e)))
  const fetchImpl = opts.fetchImpl ?? fetch
  const cacheDir = opts.cacheDir === undefined ? (opts.env ?? process.env).TTS_CACHE_DIR || 'server/.cache/tts' : opts.cacheDir

  const explain = createExplainHandler({ env: opts.env ?? process.env, fetchImpl: opts.claudeFetchImpl, log })
  const coachWording = createCoachWordingHandler({ env: opts.env ?? process.env, fetchImpl: opts.claudeFetchImpl, log })

  return async function handler(req, res) {
    const started = Date.now()
    const url = new URL(req.url, 'http://local')
    if (url.pathname === '/api/coach-wording') {
      try {
        await coachWording(req, res, url)
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: 'internal' })
      }
      return
    }
    if (url.pathname.startsWith('/api/explain')) {
      try {
        await explain(req, res, url)
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: 'internal' })
      }
      return
    }
    // Metadata only — no audio, text or transcripts are ever logged.
    const meta = { route: url.pathname, lang: url.searchParams.get('lang') ?? undefined }
    const done = (status, extra = {}) => log({ ...meta, status, ms: Date.now() - started, ...extra })

    try {
      if (req.method === 'GET' && url.pathname === '/api/speech/status') {
        sendJson(res, 200, {
          configured: Boolean(config.apiKey),
          provider: 'sarvam',
          stt: { model: config.stt.model, mode: config.stt.model === 'saaras:v3' ? config.stt.mode : null, languages: LANGUAGE_CODES },
          tts: { model: config.tts.model, speakers: config.tts.speakers },
        })
        return done(200)
      }

      if (url.pathname.startsWith('/api/speech/') && !config.apiKey) {
        sendJson(res, 503, { error: 'not_configured' })
        return done(503)
      }

      if (req.method === 'POST' && url.pathname === '/api/speech/stt') {
        const lang = url.searchParams.get('lang')
        if (!LANGUAGE_CODES.includes(lang)) throw new SarvamError('bad_language', 400)
        const audio = await readBody(req, MAX_AUDIO_BYTES)
        if (audio.length < 44) throw new SarvamError('empty_audio', 400)
        const t0 = Date.now()
        const r = await transcribe({ audio, mime: req.headers['content-type'] || 'audio/wav', languageCode: lang, config, fetchImpl })
        const upstreamMs = Date.now() - t0
        sendJson(res, 200, { transcript: r.transcript, languageCode: r.languageCode, upstreamMs })
        return done(200, { bytesIn: audio.length, upstreamMs })
      }

      if (req.method === 'POST' && url.pathname === '/api/speech/tts') {
        const body = JSON.parse((await readBody(req, MAX_JSON_BYTES)).toString('utf8') || '{}')
        const lang = body.lang
        if (!LANGUAGE_CODES.includes(lang)) throw new SarvamError('bad_language', 400)
        meta.lang = lang
        const pace = typeof body.pace === 'number' ? body.pace : 1
        const speaker = body.speaker && BULBUL_V3_SPEAKERS.includes(body.speaker) && config.tts.model === 'bulbul:v3' ? body.speaker : config.tts.speakers[lang]
        const text = String(body.text ?? '')
        const key = ttsCacheKey(config.tts.model, speaker, lang, pace, text)
        const cacheable = body.cache === true && cacheDir
        const file = cacheable ? join(cacheDir, `${key}.mp3`) : null

        if (file && existsSync(file)) {
          const audio = await readFile(file)
          res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'X-TTS-Cache': 'hit', 'X-TTS-Speaker': speaker, 'Cache-Control': 'private, max-age=31536000' })
          res.end(audio)
          return done(200, { cache: 'hit', bytesOut: audio.length })
        }
        const t0 = Date.now()
        const r = await synthesize({ text, languageCode: lang, speaker, pace, config, fetchImpl })
        const upstreamMs = Date.now() - t0
        if (file) {
          await mkdir(cacheDir, { recursive: true })
          await writeFile(file, r.audio)
        }
        res.writeHead(200, {
          'Content-Type': r.mime,
          'X-TTS-Cache': file ? 'miss' : 'off',
          'X-TTS-Speaker': speaker,
          'X-Upstream-Ms': String(upstreamMs),
          'Cache-Control': file ? 'private, max-age=31536000' : 'no-store',
        })
        res.end(r.audio)
        return done(200, { cache: file ? 'miss' : 'off', upstreamMs, bytesOut: r.audio.length })
      }

      if (opts.staticDir && req.method === 'GET') return serveStatic(opts.staticDir, url.pathname, res, done)
      sendJson(res, 404, { error: 'not_found' })
      return done(404)
    } catch (e) {
      const err = e instanceof SarvamError ? e : e instanceof SyntaxError ? new SarvamError('bad_request', 400) : new SarvamError('server_error', 500)
      const status = err.code === 'rate_limited' ? 429 : err.code === 'no_credits' ? 402 : err.status >= 400 && err.status < 600 ? err.status : 500
      if (!res.headersSent) sendJson(res, status, { error: err.code })
      return done(status, { error: err.code })
    }
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml' }

function serveStatic(root, pathname, res, done) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  let file = join(root, safe)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
  return done(200)
}

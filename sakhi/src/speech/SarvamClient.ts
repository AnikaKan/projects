// Talks to OUR backend (/api/speech/*), never to Sarvam directly. The API key lives only on the server.
import type { Lang } from '../i18n/strings'
import { LANGUAGES } from './languages'

export interface SarvamStatus {
  configured: boolean
  stt?: { model: string; mode: string | null }
  tts?: { model: string; speakers: Record<string, string> }
}

export type SarvamErrorCode = 'offline' | 'not_configured' | 'rate_limited' | 'no_credits' | 'upstream' | 'bad_request' | 'network' | 'timeout'
export class SarvamClientError extends Error {
  code: SarvamErrorCode
  constructor(code: SarvamErrorCode) {
    super(code)
    this.code = code
  }
}

export interface Fetcher {
  (input: string, init?: RequestInit): Promise<Response>
}

export interface AudioCacheLike {
  match(key: string): Promise<Blob | null>
  put(key: string, blob: Blob): Promise<void>
}

/** Cache Storage–backed audio cache (works offline once audio has been fetched). */
export const browserAudioCache: AudioCacheLike = {
  async match(key) {
    try {
      const c = await caches.open('hisaab-tts-v1')
      const r = await c.match(key)
      return r ? await r.blob() : null
    } catch {
      return null
    }
  },
  async put(key, blob) {
    try {
      const c = await caches.open('hisaab-tts-v1')
      await c.put(key, new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }))
    } catch {
      /* storage unavailable */
    }
  },
}

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Key shared with scripts/pregen-audio.ts for pre-generated lesson audio. */
export const audioKey = (lang: Lang, pace: number, preparedText: string) => sha256Hex(`${LANGUAGES[lang].bcp47}|${pace}|${preparedText}`)

export class SarvamClient {
  private statusPromise: Promise<SarvamStatus> | null = null
  private manifestPromise: Promise<Record<string, string>> | null = null
  private base: string
  private fetcher: Fetcher
  private cache: AudioCacheLike
  private isOnline: () => boolean

  constructor(opts: { base?: string; fetcher?: Fetcher; cache?: AudioCacheLike; isOnline?: () => boolean } = {}) {
    this.base = opts.base ?? '/api/speech'
    this.fetcher = opts.fetcher ?? ((u, i) => fetch(u, i))
    this.cache = opts.cache ?? browserAudioCache
    this.isOnline = opts.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  }

  online(): boolean {
    return this.isOnline()
  }

  /** Is the backend configured with a Sarvam key? Cached for the session; failures mean "no". */
  status(): Promise<SarvamStatus> {
    if (!this.statusPromise)
      this.statusPromise = this.timed(this.fetcher(`${this.base}/status`), 3000)
        .then(async (r) => (r.ok ? ((await r.json()) as SarvamStatus) : { configured: false }))
        .catch(() => {
          this.statusPromise = null // retry later (e.g. when back online)
          return { configured: false }
        })
    return this.statusPromise
  }

  /** Pre-generated lesson audio shipped with the app (public/audio/manifest.json). */
  private manifest(): Promise<Record<string, string>> {
    if (!this.manifestPromise)
      this.manifestPromise = this.fetcher('/audio/manifest.json')
        .then(async (r) => (r.ok ? ((await r.json()).entries ?? {}) : {}))
        .catch(() => ({}))
    return this.manifestPromise
  }

  /** Audio already available without calling Sarvam: shipped file or Cache Storage. */
  async cachedAudio(lang: Lang, pace: number, preparedText: string): Promise<Blob | null> {
    const key = await audioKey(lang, pace, preparedText)
    const hit = await this.cache.match(`/tts-cache/${key}`)
    if (hit) return hit
    const file = (await this.manifest())[key]
    if (!file) return null
    try {
      const r = await this.fetcher(`/audio/${file}`)
      if (!r.ok) return null
      const blob = await r.blob()
      await this.cache.put(`/tts-cache/${key}`, blob)
      return blob
    } catch {
      return null
    }
  }

  async tts(lang: Lang, preparedText: string, pace: number, opts: { cacheable: boolean; speaker?: string }): Promise<{ blob: Blob; fromCache: boolean }> {
    const cached = await this.cachedAudio(lang, pace, preparedText)
    if (cached) return { blob: cached, fromCache: true }
    if (!this.online()) throw new SarvamClientError('offline')
    const r = await this.timed(
      this.fetcher(`${this.base}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: preparedText, lang: LANGUAGES[lang].bcp47, pace, cache: opts.cacheable, speaker: opts.speaker }),
      }),
      20000,
    ).catch((e) => {
      throw e instanceof SarvamClientError ? e : new SarvamClientError('network')
    })
    if (!r.ok) throw new SarvamClientError(await this.errorCode(r))
    const blob = await r.blob()
    if (opts.cacheable) await this.cache.put(`/tts-cache/${await audioKey(lang, pace, preparedText)}`, blob)
    return { blob, fromCache: false }
  }

  async stt(lang: Lang, wav: ArrayBuffer): Promise<{ transcript: string; languageCode: string | null }> {
    if (!this.online()) throw new SarvamClientError('offline')
    const r = await this.timed(
      this.fetcher(`${this.base}/stt?lang=${LANGUAGES[lang].bcp47}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav }),
      25000,
    ).catch((e) => {
      throw e instanceof SarvamClientError ? e : new SarvamClientError('network')
    })
    if (!r.ok) throw new SarvamClientError(await this.errorCode(r))
    const j = await r.json()
    return { transcript: String(j.transcript ?? ''), languageCode: j.languageCode ?? null }
  }

  private async errorCode(r: Response): Promise<SarvamErrorCode> {
    let code = ''
    try {
      code = (await r.json())?.error ?? ''
    } catch {
      /* ignore */
    }
    if (code === 'not_configured') return 'not_configured'
    if (r.status === 429) return 'rate_limited'
    if (r.status === 402) return 'no_credits'
    if (r.status === 400) return 'bad_request'
    if (r.status === 504) return 'timeout'
    return 'upstream'
  }

  private timed<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new SarvamClientError('timeout')), ms)
      p.then(
        (v) => {
          clearTimeout(t)
          resolve(v)
        },
        (e) => {
          clearTimeout(t)
          reject(e)
        },
      )
    })
  }
}

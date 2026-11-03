// Thin, testable wrapper around the browser Web Speech API (SpeechRecognition).
//
// Privacy & reliability notes
// - We never record or store audio ourselves. The browser engine processes it; in Chrome this
//   typically means audio is sent to the vendor's online service, so it is NOT assumed to work offline.
// - The microphone is only started from listen(), which the UI calls only from a button press.
// - The recognition language is exactly the learner's language. If the engine rejects Hindi or
//   Telugu we report 'language-unsupported' and never retry in English.

import type { Lang } from '../i18n/strings'
import { LANGUAGES } from './languages'

export type SttErrorCode =
  | 'unsupported' // no SpeechRecognition in this browser
  | 'language-unsupported' // engine rejected the selected language
  | 'permission-denied' // microphone blocked by the user or policy
  | 'no-speech' // silence / nothing heard before timeout
  | 'no-match' // heard something but produced no words
  | 'audio-capture' // no microphone available
  | 'network' // online recognition service unreachable
  | 'aborted' // cancelled (navigation, language switch, user)
  | 'busy' // another recognition is already running
  | 'unknown'

export class SttError extends Error {
  code: SttErrorCode
  constructor(code: SttErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code)
    this.code = code
  }
}

export interface SttAlternative {
  transcript: string
  confidence: number
}

export interface SttResult {
  transcript: string
  confidence: number
  alternatives: SttAlternative[]
  lang: string
}

export interface ListenHandlers {
  onStart?: () => void
  onInterim?: (text: string) => void
  /** Speech ended; final result is being produced. */
  onProcessing?: () => void
}

// Minimal structural types for the browser API (not in TS DOM lib everywhere).
interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  onspeechend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognitionCtor = new () => RecognitionLike

export interface SpeechEnv {
  SpeechRecognition?: RecognitionCtor
  webkitSpeechRecognition?: RecognitionCtor
  navigator?: { onLine?: boolean; permissions?: { query(d: { name: string }): Promise<{ state: string }> } }
  setTimeout: typeof setTimeout
  clearTimeout: typeof clearTimeout
}

const ERROR_MAP: Record<string, SttErrorCode> = {
  'not-allowed': 'permission-denied',
  'service-not-allowed': 'permission-denied',
  'language-not-supported': 'language-unsupported',
  'no-speech': 'no-speech',
  'audio-capture': 'audio-capture',
  network: 'network',
  aborted: 'aborted',
}

export class SpeechRecognitionService {
  private active: RecognitionLike | null = null
  private cancelActive: (() => void) | null = null
  private env: SpeechEnv

  constructor(env?: SpeechEnv) {
    this.env = env ?? (globalThis as unknown as SpeechEnv)
  }

  private ctor(): RecognitionCtor | undefined {
    return this.env.SpeechRecognition ?? this.env.webkitSpeechRecognition
  }

  isSupported(): boolean {
    return typeof this.ctor() === 'function'
  }

  isListening(): boolean {
    return this.active !== null
  }

  /** Reads the microphone permission without prompting. 'unknown' when the browser can't tell. */
  async microphonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    try {
      const r = await this.env.navigator?.permissions?.query({ name: 'microphone' })
      return (r?.state as 'granted' | 'denied' | 'prompt') ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  /** One utterance in the learner's language. Resolves with the final words, rejects with SttError. */
  listen(lang: Lang, handlers: ListenHandlers = {}, timeoutMs = 12000, startTimeoutMs = 5000): Promise<SttResult> {
    const Ctor = this.ctor()
    if (!Ctor) return Promise.reject(new SttError('unsupported'))
    if (this.active) return Promise.reject(new SttError('busy'))
    if (this.env.navigator?.onLine === false) return Promise.reject(new SttError('network', 'offline'))

    const bcp47 = LANGUAGES[lang].bcp47
    const rec = new Ctor()
    rec.lang = bcp47 // exactly the selected language — never an English fallback
    rec.continuous = false
    rec.interimResults = true
    rec.maxAlternatives = 3
    this.active = rec

    return new Promise<SttResult>((resolve, reject) => {
      let final: SttResult | null = null
      let error: SttError | null = null
      let settled = false
      const timer = this.env.setTimeout(() => {
        if (!final && !error) error = new SttError('no-speech', 'timeout')
        try {
          rec.abort()
        } catch {
          /* ignore */
        }
        finish()
      }, timeoutMs)

      // Some engines (e.g. headless Chromium) accept start() but never begin capturing.
      let started = false
      const startTimer = this.env.setTimeout(() => {
        if (started || settled) return
        error = new SttError('unknown', 'engine did not start')
        try {
          rec.abort()
        } catch {
          /* ignore */
        }
        finish()
      }, startTimeoutMs)

      const finish = () => {
        if (settled) return
        settled = true
        this.env.clearTimeout(timer)
        this.env.clearTimeout(startTimer)
        if (this.active === rec) {
          this.active = null
          this.cancelActive = null
        }
        if (error) reject(error)
        else if (final && final.transcript.trim()) resolve(final)
        else reject(new SttError('no-match'))
      }

      this.cancelActive = () => {
        if (!error) error = new SttError('aborted')
        try {
          rec.abort()
        } catch {
          /* ignore */
        }
        finish()
      }

      rec.onstart = () => {
        started = true
        handlers.onStart?.()
      }
      rec.onspeechend = () => handlers.onProcessing?.()
      rec.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          if (res.isFinal) {
            const alts = Array.from({ length: res.length }, (_, k) => ({ transcript: res[k].transcript.trim(), confidence: res[k].confidence ?? 0 }))
            final = { transcript: alts[0]?.transcript ?? '', confidence: alts[0]?.confidence ?? 0, alternatives: alts, lang: bcp47 }
          } else interim += res[0]?.transcript ?? ''
        }
        if (interim) handlers.onInterim?.(interim.trim())
      }
      rec.onerror = (e) => {
        // Keep the first reason (e.g. our timeout) — browsers also report 'aborted' after abort().
        if (!error) error = new SttError(ERROR_MAP[e.error] ?? 'unknown', e.message || e.error)
      }
      rec.onend = finish

      try {
        rec.start()
      } catch (err) {
        error = new SttError('unknown', String(err))
        finish()
      }
    })
  }

  /** Stops listening immediately and discards any result. */
  abort(): void {
    this.cancelActive?.()
  }
}

// Test doubles for the Web Speech API. They mimic browser event order closely enough to
// exercise our services: onstart → onresult(interim…, final) → onspeechend → onend, or onerror → onend.
import { SpeechRecognitionService, type SpeechEnv } from '../SpeechRecognitionService'
import { SpeechSynthesisService, type SynthEnv, type VoiceLike } from '../SpeechSynthesisService'

export type RecScript =
  | { kind: 'result'; transcript: string; confidence?: number; interim?: string; alternatives?: string[] }
  | { kind: 'error'; error: string }
  | { kind: 'silence' } // ends without any result (some browsers) — expect no-match
  | { kind: 'hang' } // never ends (to test timeout / abort)
  | { kind: 'dead' } // start() accepted but capture never begins (seen in headless Chromium)
  /** Reject these languages with 'language-not-supported', otherwise behave like `then`. */
  | { kind: 'rejectLangs'; langs: string[]; then: RecScript }

export class RecognitionHarness {
  script: RecScript = { kind: 'result', transcript: 'yes' }
  started: { lang: string; continuous: boolean; interimResults: boolean }[] = []
  aborted = 0

  ctor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const h = this
    return class FakeRecognition {
      lang = ''
      continuous = true
      interimResults = false
      maxAlternatives = 1
      onstart: (() => void) | null = null
      onresult: ((e: unknown) => void) | null = null
      onerror: ((e: { error: string }) => void) | null = null
      onend: (() => void) | null = null
      onspeechend: (() => void) | null = null
      private ended = false
      start() {
        h.started.push({ lang: this.lang, continuous: this.continuous, interimResults: this.interimResults })
        queueMicrotask(() => this.run(h.script))
      }
      private run(s: RecScript): void {
        if (this.ended) return
        if (s.kind === 'rejectLangs') {
          if (s.langs.includes(this.lang)) return this.fail('language-not-supported')
          return this.run(s.then)
        }
        if (s.kind === 'dead') return
        this.onstart?.()
        if (s.kind === 'hang') return
        if (s.kind === 'error') return this.fail(s.error)
        if (s.kind === 'silence') {
          this.onspeechend?.()
          return this.end()
        }
        if (s.interim) this.onresult?.(this.event([{ transcript: s.interim, confidence: 0 }], false))
        const alts = [s.transcript, ...(s.alternatives ?? [])].map((t, i) => ({ transcript: t, confidence: i === 0 ? (s.confidence ?? 0.9) : 0.3 }))
        this.onresult?.(this.event(alts, true))
        this.onspeechend?.()
        this.end()
      }
      private event(alts: { transcript: string; confidence: number }[], isFinal: boolean) {
        const res = Object.assign([...alts], { isFinal })
        return { resultIndex: 0, results: [res] }
      }
      private fail(error: string) {
        this.onerror?.({ error })
        this.end()
      }
      private end() {
        if (this.ended) return
        this.ended = true
        this.onend?.()
      }
      stop() {
        this.end()
      }
      abort() {
        h.aborted++
        if (!this.ended) this.fail('aborted')
      }
    }
  }

  service(extra: Partial<SpeechEnv> = {}) {
    return new SpeechRecognitionService({
      webkitSpeechRecognition: this.ctor() as unknown as SpeechEnv['webkitSpeechRecognition'],
      navigator: { onLine: true },
      setTimeout,
      clearTimeout,
      ...extra,
    })
  }
}

export interface SpokenUtterance {
  text: string
  lang: string
  voice: VoiceLike | null
  rate: number
}

export class SynthHarness {
  voices: VoiceLike[]
  spoken: SpokenUtterance[] = []
  cancels = 0
  pauses = 0
  resumes = 0
  /** When true, utterances do not finish on their own (call finish()). */
  hold = false
  private current: { onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null } | null = null
  private listeners: (() => void)[] = []
  private voicesLoaded: boolean

  constructor(voices: VoiceLike[], opts: { lateVoices?: boolean } = {}) {
    this.voices = voices
    this.voicesLoaded = !opts.lateVoices
  }

  /** Simulates Chrome firing 'voiceschanged' after loading voices asynchronously. */
  loadVoicesNow() {
    this.voicesLoaded = true
    this.listeners.forEach((l) => l())
  }

  finish() {
    const c = this.current
    this.current = null
    c?.onend?.()
  }

  env(): SynthEnv {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const h = this
    class Utt {
      lang = ''
      rate = 1
      voice: VoiceLike | null = null
      onend: (() => void) | null = null
      onerror: ((e: { error?: string }) => void) | null = null
      onstart: (() => void) | null = null
      text: string
      constructor(text: string) {
        this.text = text
      }
    }
    return {
      SpeechSynthesisUtterance: Utt as unknown as SynthEnv['SpeechSynthesisUtterance'],
      setTimeout,
      speechSynthesis: {
        getVoices: () => (h.voicesLoaded ? h.voices : []),
        addEventListener: (_t, cb) => h.listeners.push(cb),
        removeEventListener: (_t, cb) => (h.listeners = h.listeners.filter((l) => l !== cb)),
        speak(u) {
          h.spoken.push({ text: u.text, lang: u.lang, voice: u.voice, rate: u.rate })
          h.current = u
          if (!h.hold) queueMicrotask(() => h.current === u && h.finish())
        },
        cancel() {
          h.cancels++
          const c = h.current
          h.current = null
          c?.onerror?.({ error: 'interrupted' })
        },
        pause: () => h.pauses++,
        resume: () => h.resumes++,
      },
    }
  }

  service() {
    return new SpeechSynthesisService(this.env())
  }
}

export const V = {
  enIN: { name: 'English India', lang: 'en-IN', localService: true },
  enUS: { name: 'English US', lang: 'en-US', localService: true },
  hiIN: { name: 'Hindi India', lang: 'hi-IN', localService: false },
  hi: { name: 'espeak hi', lang: 'hi', localService: true },
  teIN: { name: 'Telugu India', lang: 'te_IN', localService: true },
}

export const flush = () => new Promise((r) => setTimeout(r, 0))

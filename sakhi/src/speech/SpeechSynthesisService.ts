// Wrapper around browser SpeechSynthesis (text-to-speech).
// - One utterance queue for the whole app: starting new speech always cancels the old one (no overlap).
// - Only a voice for the learner's language is used. If none is installed we report 'no-voice'
//   and do not speak — Hindi/Telugu text is never read by an English voice.
// - Voices may be online (network) voices; availability is checked at runtime, never assumed.

import type { Lang } from '../i18n/strings'
import { chunkForSpeech, LANGUAGES, normTag, toSpeakable } from './languages'

export type TtsState = 'idle' | 'speaking' | 'paused'
export type TtsUnavailableReason = 'unsupported' | 'no-voice'

export interface VoiceLike {
  name: string
  lang: string
  localService?: boolean
  default?: boolean
  voiceURI?: string
}

interface UtteranceLike {
  text: string
  lang: string
  rate: number
  voice: VoiceLike | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  onstart: (() => void) | null
}

export interface SynthEnv {
  speechSynthesis?: {
    speak(u: UtteranceLike): void
    cancel(): void
    pause(): void
    resume(): void
    getVoices(): VoiceLike[]
    addEventListener?: (t: 'voiceschanged', cb: () => void) => void
    removeEventListener?: (t: 'voiceschanged', cb: () => void) => void
    speaking?: boolean
  }
  SpeechSynthesisUtterance?: new (text: string) => UtteranceLike
  setTimeout: typeof setTimeout
}

export interface SpeakOptions {
  slow?: boolean
  /** Id of the UI element that asked to speak (so it can show its own playing state). */
  owner?: string
  /** Text contains personal details (e.g. a name): never cache its audio. */
  personal?: boolean
}

export type SpeakOutcome = { ok: true } | { ok: false; reason: TtsUnavailableReason | 'interrupted' | 'error' }

export const NORMAL_RATE = 0.95
export const SLOW_RATE = 0.7

type Listener = (s: { state: TtsState; owner: string | null }) => void

export class SpeechSynthesisService {
  private env: SynthEnv
  private state: TtsState = 'idle'
  private owner: string | null = null
  private generation = 0
  private listeners = new Set<Listener>()
  private voicesReady: Promise<VoiceLike[]> | null = null

  constructor(env?: SynthEnv) {
    this.env = env ?? (globalThis as unknown as SynthEnv)
  }

  isSupported(): boolean {
    return !!this.env.speechSynthesis && typeof this.env.SpeechSynthesisUtterance === 'function'
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getState() {
    return { state: this.state, owner: this.owner }
  }

  private set(state: TtsState, owner: string | null) {
    this.state = state
    this.owner = owner
    this.listeners.forEach((l) => l({ state, owner }))
  }

  /** Voices load asynchronously in Chrome; wait for 'voiceschanged' up to a short timeout. */
  loadVoices(timeoutMs = 1500): Promise<VoiceLike[]> {
    const synth = this.env.speechSynthesis
    if (!synth) return Promise.resolve([])
    const now = synth.getVoices()
    if (now.length) return Promise.resolve(now)
    if (!this.voicesReady)
      this.voicesReady = new Promise((resolve) => {
        const done = () => {
          synth.removeEventListener?.('voiceschanged', done)
          resolve(synth.getVoices())
        }
        synth.addEventListener?.('voiceschanged', done)
        this.env.setTimeout(done, timeoutMs)
      })
    return this.voicesReady.then((v) => {
      if (!v.length) this.voicesReady = null // try again next time
      return v
    })
  }

  /** Best voice for the language: exact region match, then language match; local voices preferred. */
  pickVoice(voices: VoiceLike[], lang: Lang): VoiceLike | null {
    for (const tag of LANGUAGES[lang].voiceLangs) {
      const t = normTag(tag)
      const matches = voices.filter((v) => (t.includes('-') ? normTag(v.lang) === t : normTag(v.lang).split('-')[0] === t))
      if (matches.length) return matches.find((v) => v.localService) ?? matches[0]
    }
    return null
  }

  async voiceFor(lang: Lang): Promise<VoiceLike | null> {
    if (!this.isSupported()) return null
    return this.pickVoice(await this.loadVoices(), lang)
  }

  /** Speaks text in the learner's language. Any current speech is cancelled first. */
  async speak(text: string, lang: Lang, opts: SpeakOptions = {}): Promise<SpeakOutcome> {
    const synth = this.env.speechSynthesis
    const Utt = this.env.SpeechSynthesisUtterance
    this.stop()
    const gen = ++this.generation
    if (!synth || !Utt) return { ok: false, reason: 'unsupported' }
    const voice = await this.voiceFor(lang)
    if (gen !== this.generation) return { ok: false, reason: 'interrupted' }
    if (!voice) return { ok: false, reason: 'no-voice' }

    const chunks = chunkForSpeech(toSpeakable(text, lang))
    const owner = opts.owner ?? null
    this.set('speaking', owner)
    return new Promise<SpeakOutcome>((resolve) => {
      let i = 0
      const next = () => {
        if (gen !== this.generation) return resolve({ ok: false, reason: 'interrupted' })
        if (i >= chunks.length) {
          this.set('idle', null)
          return resolve({ ok: true })
        }
        const u = new Utt(chunks[i++])
        u.lang = LANGUAGES[lang].bcp47
        u.voice = voice
        u.rate = opts.slow ? SLOW_RATE : NORMAL_RATE
        u.onend = next
        u.onerror = (e) => {
          if (gen !== this.generation || e.error === 'interrupted' || e.error === 'canceled') return resolve({ ok: false, reason: 'interrupted' })
          this.set('idle', null)
          resolve({ ok: false, reason: 'error' })
        }
        synth.speak(u)
      }
      next()
    })
  }

  pause(): void {
    if (this.state !== 'speaking') return
    this.env.speechSynthesis?.pause()
    this.set('paused', this.owner)
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.env.speechSynthesis?.resume()
    this.set('speaking', this.owner)
  }

  /** Stops all speech immediately (navigation, language switch, new speech). */
  stop(): void {
    this.generation++
    const synth = this.env.speechSynthesis
    if (synth) {
      // Chrome keeps a paused queue alive; resume before cancelling so cancel takes effect.
      if (this.state === 'paused') synth.resume()
      synth.cancel()
    }
    if (this.state !== 'idle') this.set('idle', null)
  }
}

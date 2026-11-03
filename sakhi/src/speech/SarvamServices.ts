// Sarvam-backed TTS and STT engines (via our backend), plus Hybrid engines that prefer Sarvam
// and fall back to browser speech — and, if that fails too, to text and tap answers.

import type { Lang } from '../i18n/strings'
import type { AudioCapture } from './audioCapture'
import { CaptureError } from './audioCapture'
import type { EngineId, EnginePreference, SttEngine, TtsEngine } from './engines'
import { SarvamClient, SarvamClientError } from './SarvamClient'
import { SARVAM_MAX_CHARS, SARVAM_PACE, toSarvamSpeakable } from './sarvamText'
import { SttError, type ListenHandlers, type SttResult } from './SpeechRecognitionService'
import type { SpeakOptions, SpeakOutcome, TtsState, VoiceLike } from './SpeechSynthesisService'
import { encodeWavPcm16, resample } from './wav'
import { LANGUAGES } from './languages'

type Listener = (s: { state: TtsState; owner: string | null }) => void

export interface AudioPlayerLike {
  play(blob: Blob, onEnd: () => void, onError: () => void): void
  pause(): void
  resume(): void
  stop(): void
}

/** HTMLAudioElement player; revokes object URLs so no audio lingers in memory. */
export class HtmlAudioPlayer implements AudioPlayerLike {
  private el: HTMLAudioElement | null = null
  private url: string | null = null
  play(blob: Blob, onEnd: () => void, onError: () => void) {
    this.stop()
    this.url = URL.createObjectURL(blob)
    const el = new Audio(this.url)
    this.el = el
    el.onended = () => {
      this.release()
      onEnd()
    }
    el.onerror = () => {
      this.release()
      onError()
    }
    el.play().catch(() => {
      this.release()
      onError()
    })
  }
  pause() {
    this.el?.pause()
  }
  resume() {
    this.el?.play().catch(() => {})
  }
  stop() {
    if (this.el) {
      this.el.onended = null
      this.el.onerror = null
      this.el.pause()
    }
    this.release()
  }
  private release() {
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = null
    this.el = null
  }
}

export class SarvamTtsService implements TtsEngine {
  private state: TtsState = 'idle'
  private owner: string | null = null
  private generation = 0
  private listeners = new Set<Listener>()
  lastError: SarvamClientError | null = null
  private client: SarvamClient
  private player: AudioPlayerLike
  speakerOverride: Partial<Record<Lang, string>> = {}

  constructor(client: SarvamClient, player: AudioPlayerLike = new HtmlAudioPlayer()) {
    this.client = client
    this.player = player
  }

  isSupported() {
    return typeof Blob !== 'undefined'
  }
  subscribe(fn: Listener) {
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

  /** A "voice" exists when the backend is configured and online (or audio is cached — checked at speak time). */
  async voiceFor(lang: Lang): Promise<VoiceLike | null> {
    const st = await this.client.status()
    if (!st.configured || !this.client.online()) return null
    return { name: `Sarvam ${st.tts?.model ?? ''} ${st.tts?.speakers?.[LANGUAGES[lang].bcp47] ?? ''}`.trim(), lang: LANGUAGES[lang].bcp47, localService: false }
  }

  async speak(text: string, lang: Lang, opts: SpeakOptions & { cacheable?: boolean } = {}): Promise<SpeakOutcome & { engine?: EngineId; latencyMs?: number }> {
    this.stop()
    const gen = ++this.generation
    const prepared = toSarvamSpeakable(text, lang)
    if (prepared.length > SARVAM_MAX_CHARS) return { ok: false, reason: 'error' }
    const pace = opts.slow ? SARVAM_PACE.slow : SARVAM_PACE.normal
    const t0 = performance.now()
    this.set('speaking', opts.owner ?? null) // shows "playing" while audio is fetched
    let blob: Blob
    let fromCache = false
    try {
      ;({ blob, fromCache } = await this.client.tts(lang, prepared, pace, { cacheable: opts.cacheable ?? true, speaker: this.speakerOverride[lang] }))
    } catch (e) {
      this.lastError = e instanceof SarvamClientError ? e : new SarvamClientError('network')
      if (gen === this.generation) this.set('idle', null)
      return { ok: false, reason: 'error' }
    }
    if (gen !== this.generation) return { ok: false, reason: 'interrupted' }
    const latencyMs = Math.round(performance.now() - t0)
    return new Promise((resolve) => {
      this.player.play(
        blob,
        () => {
          if (gen === this.generation) this.set('idle', null)
          resolve({ ok: true, engine: fromCache ? 'cached' : 'sarvam', latencyMs })
        },
        () => {
          if (gen === this.generation) this.set('idle', null)
          resolve({ ok: false, reason: 'error' })
        },
      )
    })
  }

  pause() {
    if (this.state !== 'speaking') return
    this.player.pause()
    this.set('paused', this.owner)
  }
  resume() {
    if (this.state !== 'paused') return
    this.player.resume()
    this.set('speaking', this.owner)
  }
  stop() {
    this.generation++
    this.player.stop()
    if (this.state !== 'idle') this.set('idle', null)
  }
}

export class SarvamSttService implements SttEngine {
  private listening = false
  lastError: SarvamClientError | null = null
  private client: SarvamClient
  private capture: AudioCapture

  constructor(client: SarvamClient, capture: AudioCapture) {
    this.client = client
    this.capture = capture
  }

  isSupported() {
    return this.capture.isSupported()
  }
  isListening() {
    return this.listening
  }
  async microphonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
    try {
      const r = await navigator.permissions?.query({ name: 'microphone' as PermissionName })
      return (r?.state as 'granted' | 'denied' | 'prompt') ?? 'unknown'
    } catch {
      return 'unknown'
    }
  }

  async listen(lang: Lang, handlers: ListenHandlers = {}): Promise<SttResult & { engine: EngineId }> {
    if (!this.capture.isSupported()) throw new SttError('unsupported')
    if (this.listening) throw new SttError('busy')
    if (!this.client.online()) throw new SttError('network', 'offline')
    this.listening = true
    try {
      const audio = await this.capture.record({ onStart: handlers.onStart, maxMs: 15000 })
      handlers.onProcessing?.()
      const wav = encodeWavPcm16(resample(audio.samples, audio.sampleRate))
      const r = await this.client.stt(lang, wav)
      if (!r.transcript.trim()) throw new SttError('no-match')
      return { transcript: r.transcript.trim(), confidence: 1, alternatives: [{ transcript: r.transcript.trim(), confidence: 1 }], lang: LANGUAGES[lang].bcp47, engine: 'sarvam' }
    } catch (e) {
      if (e instanceof SttError) throw e
      if (e instanceof CaptureError) throw new SttError(e.code === 'unsupported' ? 'unsupported' : e.code)
      if (e instanceof SarvamClientError) {
        this.lastError = e
        throw new SttError(e.code === 'offline' || e.code === 'network' || e.code === 'timeout' ? 'network' : 'unknown', e.code)
      }
      throw new SttError('unknown')
    } finally {
      this.listening = false
    }
  }

  abort() {
    this.capture.abort()
  }
}

/** Server-side failures that mean "use the browser engine instead for a while". */
const FALLBACK_CODES = new Set(['not_configured', 'upstream', 'network', 'timeout', 'rate_limited', 'no_credits', 'offline'])

/**
 * Prefers Sarvam when the backend is configured and online; otherwise (or after a failure) uses
 * browser speech. If neither can speak, reports no-voice so the UI shows its text fallback.
 */
export class HybridTts implements TtsEngine {
  private sarvam: SarvamTtsService
  private browser: TtsEngine
  private pref: () => EnginePreference
  private client: SarvamClient
  private unhealthyUntil = 0
  private listeners = new Set<Listener>()
  lastEngine: EngineId | null = null

  constructor(sarvam: SarvamTtsService, browser: TtsEngine, client: SarvamClient, pref: () => EnginePreference) {
    this.sarvam = sarvam
    this.browser = browser
    this.client = client
    this.pref = pref
    const fwd: Listener = (s) => this.listeners.forEach((l) => l(s))
    sarvam.subscribe(fwd)
    browser.subscribe(fwd)
  }

  private async useSarvam(): Promise<boolean> {
    if (this.pref() === 'browser') return false
    if (Date.now() < this.unhealthyUntil && this.pref() === 'auto') return false
    return (await this.client.status()).configured
  }

  isSupported() {
    return this.sarvam.isSupported() || this.browser.isSupported()
  }
  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState() {
    const s = this.sarvam.getState()
    return s.state !== 'idle' ? s : this.browser.getState()
  }
  async voiceFor(lang: Lang) {
    if (await this.useSarvam()) {
      const v = await this.sarvam.voiceFor(lang)
      if (v) return v
      // Offline: cached lesson audio may still play, but we cannot promise it for arbitrary text.
    }
    return this.pref() === 'sarvam' ? null : this.browser.voiceFor(lang)
  }
  async speak(text: string, lang: Lang, opts: SpeakOptions = {}) {
    this.stop()
    if (this.pref() !== 'browser') {
      const st = await this.client.status()
      const resting = this.pref() === 'auto' && Date.now() < this.unhealthyUntil && this.client.online()
      if (!resting && (st.configured || !this.client.online())) {
        // Try Sarvam (or its offline cache) first.
        const r = await this.sarvam.speak(text, lang, { ...opts, cacheable: !opts.personal })
        if (r.ok || r.reason === 'interrupted') {
          this.lastEngine = r.engine ?? 'sarvam'
          return r
        }
        if (this.pref() === 'sarvam') return r
        if (this.sarvam.lastError && FALLBACK_CODES.has(this.sarvam.lastError.code)) this.unhealthyUntil = Date.now() + 60_000
      }
    }
    if (this.pref() === 'sarvam') return { ok: false as const, reason: 'no-voice' as const }
    this.lastEngine = 'browser'
    const r = await this.browser.speak(text, lang, opts)
    return { ...r, engine: 'browser' as EngineId }
  }
  pause() {
    this.sarvam.pause()
    this.browser.pause()
  }
  resume() {
    this.sarvam.resume()
    this.browser.resume()
  }
  stop() {
    this.sarvam.stop()
    this.browser.stop()
  }
}

export class HybridStt implements SttEngine {
  private sarvam: SarvamSttService
  private browser: SttEngine
  private client: SarvamClient
  private pref: () => EnginePreference
  private unhealthyUntil = 0
  private active: SttEngine | null = null
  lastEngine: EngineId | null = null
  private sarvamReady = false

  constructor(sarvam: SarvamSttService, browser: SttEngine, client: SarvamClient, pref: () => EnginePreference) {
    this.sarvam = sarvam
    this.browser = browser
    this.client = client
    this.pref = pref
    client.status().then((s) => (this.sarvamReady = s.configured))
  }

  private sarvamUsable() {
    return this.pref() !== 'browser' && this.sarvamReady && this.sarvam.isSupported() && this.client.online() && (this.pref() === 'sarvam' || Date.now() >= this.unhealthyUntil)
  }

  isSupported() {
    return this.pref() === 'sarvam' ? this.sarvam.isSupported() : this.sarvam.isSupported() || this.browser.isSupported()
  }
  isListening() {
    return this.active?.isListening() ?? false
  }
  microphonePermission() {
    return this.sarvam.microphonePermission()
  }

  async listen(lang: Lang, handlers?: ListenHandlers) {
    this.sarvamReady = (await this.client.status()).configured
    const useSarvam = this.sarvamUsable()
    const engine: SttEngine = useSarvam ? this.sarvam : this.browser
    if (!useSarvam && this.pref() === 'sarvam') throw new SttError('unsupported', 'sarvam unavailable')
    this.active = engine
    try {
      const r = await engine.listen(lang, handlers)
      this.lastEngine = useSarvam ? 'sarvam' : 'browser'
      return { ...r, engine: this.lastEngine }
    } catch (e) {
      // A server-side failure: show the error now; the next press uses browser recognition.
      if (useSarvam && this.sarvam.lastError && FALLBACK_CODES.has(this.sarvam.lastError.code) && this.browser.isSupported()) this.unhealthyUntil = Date.now() + 60_000
      throw e
    } finally {
      this.active = null
    }
  }

  abort() {
    this.sarvam.abort()
    this.browser.abort()
  }
}

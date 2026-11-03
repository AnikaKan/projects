// Engine interfaces shared by browser speech, Sarvam speech and the hybrid that chooses between them.
import type { Lang } from '../i18n/strings'
import type { ListenHandlers, SttResult } from './SpeechRecognitionService'
import type { SpeakOptions, SpeakOutcome, TtsState, VoiceLike } from './SpeechSynthesisService'

export type EngineId = 'browser' | 'sarvam' | 'cached'
export type EnginePreference = 'auto' | 'browser' | 'sarvam'

export interface SttEngine {
  isSupported(): boolean
  isListening(): boolean
  microphonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'>
  listen(lang: Lang, handlers?: ListenHandlers): Promise<SttResult & { engine?: EngineId }>
  abort(): void
}

export interface TtsEngine {
  isSupported(): boolean
  subscribe(fn: (s: { state: TtsState; owner: string | null }) => void): () => void
  getState(): { state: TtsState; owner: string | null }
  voiceFor(lang: Lang): Promise<VoiceLike | null>
  speak(text: string, lang: Lang, opts?: SpeakOptions): Promise<SpeakOutcome & { engine?: EngineId; latencyMs?: number }>
  pause(): void
  resume(): void
  stop(): void
}

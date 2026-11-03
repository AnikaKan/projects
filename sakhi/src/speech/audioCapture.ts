// Microphone capture for server-side STT. Audio stays in memory only for the length of one answer:
// it is converted to WAV, uploaded once, and dropped. Nothing is stored or replayed.
import { downmix, rms } from './wav'

export interface CaptureOptions {
  /** Hard cap; Sarvam's sync REST endpoint accepts ≤ 30 s. */
  maxMs?: number
  /** Stop after this much silence once speech has started. */
  silenceMs?: number
  /** Give up if nothing louder than the threshold is heard in this time. */
  noSpeechMs?: number
  threshold?: number
  onStart?: () => void
  onSpeech?: () => void
}

export interface CapturedAudio {
  samples: Float32Array
  sampleRate: number
}

export type CaptureErrorCode = 'permission-denied' | 'audio-capture' | 'no-speech' | 'aborted' | 'unsupported'
export class CaptureError extends Error {
  code: CaptureErrorCode
  constructor(code: CaptureErrorCode) {
    super(code)
    this.code = code
  }
}

export interface AudioCapture {
  isSupported(): boolean
  record(opts?: CaptureOptions): Promise<CapturedAudio>
  abort(): void
}

type AnyWindow = typeof globalThis & { webkitAudioContext?: typeof AudioContext }

/** Browser implementation: getUserMedia → AudioContext → ScriptProcessor (widest mobile support). */
export class BrowserAudioCapture implements AudioCapture {
  private cancel: (() => void) | null = null

  isSupported(): boolean {
    const g = globalThis as AnyWindow
    return !!g.navigator?.mediaDevices?.getUserMedia && !!(g.AudioContext ?? g.webkitAudioContext)
  }

  record(opts: CaptureOptions = {}): Promise<CapturedAudio> {
    const { maxMs = 15000, silenceMs = 1200, noSpeechMs = 6000, threshold = 0.015 } = opts
    if (!this.isSupported()) return Promise.reject(new CaptureError('unsupported'))
    return new Promise<CapturedAudio>((resolve, reject) => {
      let stream: MediaStream | null = null
      let ctx: AudioContext | null = null
      const chunks: Float32Array[][] = []
      let heard = false
      let lastLoud = 0
      let startedAt = 0
      let settled = false
      const cleanup = () => {
        stream?.getTracks().forEach((t) => t.stop()) // release the microphone immediately
        ctx?.close().catch(() => {})
        this.cancel = null
      }
      const finish = (err?: CaptureError) => {
        if (settled) return
        settled = true
        const rate = ctx?.sampleRate ?? 48000
        cleanup()
        if (err) return reject(err)
        const channels = chunks.length ? chunks[0].map((_, c) => concat(chunks.map((ch) => ch[c]))) : [new Float32Array(0)]
        resolve({ samples: downmix(channels), sampleRate: rate })
      }
      this.cancel = () => finish(new CaptureError('aborted'))

      navigator.mediaDevices
        .getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } })
        .then((s) => {
          if (settled) return s.getTracks().forEach((t) => t.stop())
          stream = s
          const Ctx = (globalThis as AnyWindow).AudioContext ?? (globalThis as AnyWindow).webkitAudioContext!
          ctx = new Ctx()
          const src = ctx.createMediaStreamSource(s)
          const proc = ctx.createScriptProcessor(4096, 1, 1)
          startedAt = performance.now()
          opts.onStart?.()
          proc.onaudioprocess = (e) => {
            if (settled) return
            const data = [new Float32Array(e.inputBuffer.getChannelData(0))]
            chunks.push(data)
            const now = performance.now()
            if (rms(data[0]) > threshold) {
              if (!heard) opts.onSpeech?.()
              heard = true
              lastLoud = now
            }
            if (!heard && now - startedAt > noSpeechMs) finish(new CaptureError('no-speech'))
            else if (heard && now - lastLoud > silenceMs) finish()
            else if (now - startedAt > maxMs) finish()
          }
          src.connect(proc)
          proc.connect(ctx.destination)
        })
        .catch((e: DOMException) => {
          finish(new CaptureError(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'permission-denied' : 'audio-capture'))
        })
    })
  }

  abort(): void {
    this.cancel?.()
  }
}

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

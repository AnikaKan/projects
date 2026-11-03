// Reusable voice interaction hooks. They know nothing about lessons or scoring:
// they speak text, capture a transcript, let the learner correct it, and propose an option id.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Lang } from '../i18n/strings'
import { useSpeechServices } from './SpeechContext'
import { type MatchableOption, type MatchResult } from './answerMatching'
import { interpretUtterance, type UtteranceIntent } from './intent'
import { SttError, type SttErrorCode } from './SpeechRecognitionService'
import type { TtsState, TtsUnavailableReason } from './SpeechSynthesisService'

// ── Text-to-speech ───────────────────────────────────────────────────

export type VoiceAvailability = 'checking' | 'available' | TtsUnavailableReason

export function useSpeaker(lang: Lang) {
  const { tts, slow, setSlow } = useSpeechServices()
  const id = useId()
  const [g, setG] = useState(tts.getState())
  const [availability, setAvailability] = useState<VoiceAvailability>(tts.isSupported() ? 'checking' : 'unsupported')
  const [played, setPlayed] = useState(false)

  useEffect(() => tts.subscribe(setG), [tts])

  useEffect(() => {
    let live = true
    if (!tts.isSupported()) return setAvailability('unsupported')
    setAvailability('checking')
    tts.voiceFor(lang).then((v) => live && setAvailability(v ? 'available' : 'no-voice'))
    return () => {
      live = false
    }
  }, [tts, lang])

  // Stop this component's speech when the language changes or it unmounts.
  const mine = g.owner === id
  const mineRef = useRef(mine)
  mineRef.current = mine
  useEffect(() => () => {
    if (mineRef.current) tts.stop()
  }, [tts, lang])

  const speak = useCallback(
    async (text: string, opts: { personal?: boolean; slow?: boolean } = {}) => {
      setPlayed(true)
      const r = await tts.speak(text, lang, { slow: opts.slow || slow, owner: id, personal: opts.personal })
      if (!r.ok && (r.reason === 'no-voice' || r.reason === 'unsupported')) setAvailability(r.reason)
      return r
    },
    [tts, lang, slow, id],
  )

  return {
    speak,
    pause: () => tts.pause(),
    resume: () => tts.resume(),
    stop: () => tts.stop(),
    /** State of this control's own speech ('idle' when another control is speaking). */
    state: (mine ? g.state : 'idle') as TtsState,
    availability,
    played,
    slow,
    setSlow,
  }
}

// ── Speech-to-text ───────────────────────────────────────────────────

export type ListenStatus = 'idle' | 'requesting' | 'listening' | 'processing' | 'result' | 'error'

export function useListener(lang: Lang) {
  const { stt } = useSpeechServices()
  const [status, setStatus] = useState<ListenStatus>(stt.isSupported() ? 'idle' : 'error')
  const [interim, setInterim] = useState('')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<SttErrorCode | null>(stt.isSupported() ? null : 'unsupported')
  const live = useRef(true)

  useEffect(() => {
    live.current = true
    return () => {
      live.current = false
      stt.abort()
    }
  }, [stt])

  // A language switch cancels any capture in the old language and clears the transcript.
  useEffect(() => {
    stt.abort()
    setInterim('')
    setTranscript('')
    if (stt.isSupported()) {
      setStatus('idle')
      setError(null)
    }
  }, [lang, stt])

  /** Must be called from a button press: this is what turns the microphone on. */
  const start = useCallback(async () => {
    setError(null)
    setInterim('')
    setStatus('requesting')
    try {
      const r = await stt.listen(lang, {
        onStart: () => live.current && setStatus('listening'),
        onInterim: (t) => live.current && setInterim(t),
        onProcessing: () => live.current && setStatus('processing'),
      })
      if (!live.current) return
      setTranscript(r.transcript)
      setStatus('result')
    } catch (e) {
      if (!live.current) return
      const code = e instanceof SttError ? e.code : 'unknown'
      if (code === 'aborted') {
        setStatus('idle')
        return
      }
      setError(code)
      setStatus('error')
    }
  }, [stt, lang])

  const cancel = useCallback(() => {
    stt.abort()
    setStatus('idle')
    setInterim('')
  }, [stt])

  const reset = useCallback(() => {
    setTranscript('')
    setInterim('')
    setStatus(stt.isSupported() ? 'idle' : 'error')
  }, [stt])

  return { supported: stt.isSupported(), status, interim, transcript, setTranscript, error, start, cancel, reset }
}

// ── Combined: listen → show words → let learner correct → propose an option ───

export function useVoiceInteraction(lang: Lang, options: MatchableOption[]) {
  const speaker = useSpeaker(lang)
  const listener = useListener(lang)
  // Intent first (clarification / uncertainty / sensitive / out of scope), then the answer: see speech/intent.ts.
  const intent: UtteranceIntent | null = useMemo(
    () => (listener.status === 'result' ? interpretUtterance(listener.transcript, lang, options) : null),
    [listener.status, listener.transcript, lang, options],
  )
  const match: MatchResult | null = intent
    ? intent.kind === 'answer'
      ? { status: 'match', optionId: intent.optionId, via: intent.via as 'amount', confidence: intent.confidence }
      : { status: 'no_match', reason: 'not_understood' }
    : null
  // Never talk over the learner: stop reading aloud when the microphone starts.
  const listen = useCallback(() => {
    speaker.stop()
    return listener.start()
  }, [speaker, listener])
  return { speaker, listener, match, intent, listen }
}

// Read a question and each answer choice aloud, one after another, highlighting the choice being read.
// Built for learners who may not read fluently (UX redesign 2026-11-01):
//   - "Listen" plays the question, then every choice; tapping again replays; "Stop" stops.
//   - Each choice also has its own small speaker button ("hear this answer").
//   - After the learner has interacted with the page once (browser autoplay rule), a new question is read
//     automatically. Speech only ever uses a voice for the selected language (useSpeaker); with no voice
//     the usual "no voice on this phone" notice is shown and nothing plays.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Square, Turtle, Volume2, VolumeX } from 'lucide-react'
import { useApp } from '../../state/AppState'
import { useSpeaker } from '../../speech/useVoiceInteraction'

export interface ReadableChoice {
  id: string
  label: string
}

/** 'question' or a choice id while it is being read; null when silent. */
export type ReadingId = 'question' | string | null

function userHasInteracted(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return !!ua?.hasBeenActive
}

export function useReadAloud(question: string, choices: ReadableChoice[], opts: { auto?: boolean; key?: string } = {}) {
  const { lang } = useApp()
  const sp = useSpeaker(lang)
  void lang
  const [reading, setReading] = useState<ReadingId>(null)
  const run = useRef(0)
  const say = useCallback((text: string) => sp.speak(text), [sp])

  const stop = useCallback(() => {
    run.current++
    setReading(null)
    sp.stop()
  }, [sp])

  const playAll = useCallback(async () => {
    const my = ++run.current
    setReading('question')
    const first = await say(question)
    if (my !== run.current || !first.ok) return my === run.current && setReading(null)
    for (const c of choices) {
      if (my !== run.current) return
      setReading(c.id)
      const r = await say(c.label)
      if (!r.ok) break
    }
    if (my === run.current) setReading(null)
  }, [question, choices, say])

  const playOne = useCallback(
    async (id: string) => {
      const c = choices.find((x) => x.id === id)
      if (!c) return
      const my = ++run.current
      setReading(id)
      await say(c.label)
      if (my === run.current) setReading(null)
    },
    [choices, say],
  )

  // Auto-read each new question once, if the learner has already tapped something on this page.
  const autoKey = opts.key ?? question
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (!opts.auto || sp.availability !== 'available' || done.current === autoKey || !userHasInteracted()) return
    done.current = autoKey
    void playAll()
  }, [opts.auto, sp.availability, autoKey, playAll])

  // Stop when the screen goes away.
  useEffect(() => () => {
    run.current++
  }, [])

  return { reading, playAll, playOne, stop, availability: sp.availability, slow: sp.slow, setSlow: sp.setSlow }
}

/** The big "Listen" button for a question and its answers, with Stop and Slow. */
export function ReadAloudBar({ ra, className = '', onListen }: { ra: ReturnType<typeof useReadAloud>; className?: string; onListen?: () => void }) {
  const { t, lang } = useApp()
  if (ra.availability === 'no-voice' || ra.availability === 'unsupported')
    return (
      <p data-testid="tts-fallback" data-reason={ra.availability} className={`flex items-start gap-2 rounded-2xl bg-white px-3 py-2 text-base leading-relaxed text-muted ring-1 ring-line ${className}`}>
        <VolumeX size={20} className="mt-0.5 shrink-0" aria-hidden />
        <span>{ra.availability === 'no-voice' ? t('tts.noVoice', { language: t(`lang.name.${lang}`) }) : t('tts.unsupported')}</span>
      </p>
    )
  const playing = ra.reading !== null
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="read-aloud" data-reading={ra.reading ?? ''}>
      <button
        data-testid="tts-play"
        onClick={() => {
          if (playing) return ra.stop()
          onListen?.()
          void ra.playAll()
        }}
        disabled={ra.availability === 'checking'}
        className={`inline-flex min-h-[48px] flex-1 items-center justify-center gap-2.5 rounded-full px-4 text-base font-bold shadow-sm disabled:opacity-60 ${
          playing ? 'bg-ink text-white' : 'bg-marigold text-ink'
        }`}
      >
        <span className={`grid h-8 w-8 place-items-center rounded-full ${playing ? 'bg-white/20' : 'bg-white/70'}`}>
          {playing ? <Square size={16} aria-hidden /> : <Volume2 size={20} aria-hidden />}
        </span>
        {playing ? t('read.stop') : t('read.all')}
      </button>
      <button
        data-testid="tts-slow"
        aria-pressed={ra.slow}
        aria-label={t('tts.slow')}
        title={t('tts.slow')}
        onClick={() => ra.setSlow(!ra.slow)}
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ring-2 ${ra.slow ? 'bg-brand text-white ring-brand' : 'bg-white text-ink ring-line'}`}
      >
        <Turtle size={22} aria-hidden />
      </button>
    </div>
  )
}

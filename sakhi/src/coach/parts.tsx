// Small shared pieces of the Coach View: status and level chips, section cards, notes form, lesson preview.
import { useState, type ReactNode } from 'react'
import { LANGS, type Lang } from '../i18n/strings'
import type { LessonId } from '../assessment/types'
import { useApp } from '../state/AppState'
import { SpeakControls } from '../components/speech/SpeakControls'
import { LESSONS } from '../learning/storage'
import { text as lessonText, valuesFor } from '../learning/render'
import { challengeWording, mainChallengeFor } from '../progress/challenges'
import { NoteRejected } from '../progress/engine'
import { NOTE_CATEGORIES, type CoachLevel, type LearnerProfile, type NoteCategory } from '../progress/types'
import { EmptyNote, type CoachStatus } from '../coaching/model'

export const STATUS_STYLE: Record<CoachStatus, { cls: string; icon: string }> = {
  followUp: { cls: 'bg-marigold-soft text-[#7A4A0E] ring-marigold/60', icon: '🚩' },
  needsPractice: { cls: 'bg-clay-soft text-clay ring-clay/40', icon: '🔁' },
  doingWell: { cls: 'bg-leaf-soft text-leaf ring-leaf/40', icon: '✅' },
}

export function StatusChip({ status, testid }: { status: CoachStatus; testid?: string }) {
  const { tc } = useApp()
  const s = STATUS_STYLE[status]
  return (
    <span data-testid={testid} data-status={status} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ring-1 ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {tc(`cv.status.${status}`)}
    </span>
  )
}

export const LEVEL_EMOJI: Record<CoachLevel | 'none', string> = { foundational: '🌱', intermediate: '🌿', none: '⚪' }

export function LevelChip({ level, none, testid }: { level: CoachLevel; none?: boolean; testid?: string }) {
  const { tc } = useApp()
  const k = none ? 'none' : level
  return (
    <span data-testid={testid} data-level={k} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-sm font-semibold ring-1 ring-line">
      <span aria-hidden>{LEVEL_EMOJI[k]}</span>
      {tc(`cv.level.${k}`)}
    </span>
  )
}

export const BUSINESS_EMOJI = { vegetable: '🥬', tea: '☕', grocery: '🏪' } as const

export function Section({ title, icon, children, testid, right, className = '' }: { title: string; icon?: string; children: ReactNode; testid?: string; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 ring-1 ring-line ${className}`} data-testid={testid}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold leading-snug">
          {icon && <span aria-hidden>{icon}</span>}
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

/** Toggle buttons for en / hi / te (used for the learner-facing language inside a session). */
export function LangToggle({ value, onChange, mark, testidPrefix }: { value: Lang; onChange: (l: Lang) => void; mark?: Lang; testidPrefix: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {LANGS.map((l) => (
        <button
          key={l.code}
          lang={l.bcp47}
          data-testid={`${testidPrefix}-${l.code}`}
          aria-pressed={value === l.code}
          onClick={() => onChange(l.code)}
          className={`min-h-[44px] rounded-full px-3.5 text-base font-semibold ${value === l.code ? 'bg-brand text-white' : 'bg-white text-ink ring-1 ring-line'}`}
        >
          {l.native}
          {mark === l.code ? ' ★' : ''}
        </button>
      ))}
    </div>
  )
}

/** Structured coach note: tap categories, optional short text (screened for personal data). */
export function NoteForm({ learnerId, sessionId, onSaved, testid = 'note-form' }: { learnerId: string; sessionId?: string; onSaved?: () => void; testid?: string }) {
  const { tc, addNote } = useApp()
  const [cats, setCats] = useState<NoteCategory[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const save = () => {
    try {
      addNote(learnerId, { categories: cats, text, sessionId })
      setCats([])
      setText('')
      setError(null)
      setSaved(true)
      onSaved?.()
    } catch (e) {
      if (e instanceof NoteRejected) setError(tc(e.message === 'personal' ? 'coach.noteRejected' : 'coach.noteTooLong'))
      else if (e instanceof EmptyNote) setError(tc('cv.noteEmpty'))
      else throw e
    }
  }
  return (
    <div className="space-y-2" data-testid={testid}>
      <div className="flex flex-wrap gap-1.5">
        {NOTE_CATEGORIES.map((c) => {
          const on = cats.includes(c)
          return (
            <button
              key={c}
              data-testid={`note-cat-${c}`}
              aria-pressed={on}
              onClick={() => {
                setSaved(false)
                setCats(on ? cats.filter((x) => x !== c) : [...cats, c])
              }}
              className={`min-h-[44px] rounded-full px-3 text-sm font-semibold ${on ? 'bg-brand text-white' : 'bg-paper text-ink ring-1 ring-line'}`}
            >
              {tc(`cv.note.${c}`)}
            </button>
          )
        })}
      </div>
      <label className="block">
        <span className="text-sm font-semibold">{tc('cv.noteText')}</span>
        <input
          data-testid="note-text"
          value={text}
          maxLength={200}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
            setSaved(false)
          }}
          className="mt-1 min-h-[48px] w-full rounded-xl bg-white px-3 text-base ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <span className="text-xs text-muted">{tc('cv.noteHint')}</span>
      </label>
      {error && (
        <p role="alert" data-testid="note-error" className="rounded-lg bg-clay-soft p-2 text-sm text-clay">
          {error}
        </p>
      )}
      <button data-testid="note-save" onClick={save} className="min-h-[48px] rounded-full bg-brand px-5 text-base font-bold text-white active:bg-brand-dark">
        {saved ? `✓ ${tc('cv.s.rNote')}` : tc('cv.saveNote')}
      </button>
    </div>
  )
}

/** Key parts of a lesson, playable in any supported language (replay lesson audio). */
export function LessonParts({ p, lessonId, lang }: { p: LearnerProfile; lessonId: LessonId; lang: Lang }) {
  const { tc } = useApp()
  const content = LESSONS[lessonId]
  if (!content) return null
  const main = mainChallengeFor(lessonId)
  const parts: [string, string][] = [
    ['coach.prevIntro', lessonText(content, lang, p.business, 'intro.0')],
    ['coach.prevExample', lessonText(content, lang, p.business, 'example.0', valuesFor(content, p.business, 'example'))],
    ['coach.prevRule', lessonText(content, lang, p.business, 'complete.rule')],
    ...(main ? ([['coach.prevActivity', challengeWording(main.id, lang, p.business)]] as [string, string][]) : []),
  ]
  return (
    <div className="space-y-2" data-testid="lesson-review" data-play-lang={lang}>
      {parts.map(([k, txt]) => (
        <div key={k} className="rounded-xl bg-paper p-3 ring-1 ring-line">
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{tc(k)}</div>
          <p className="mt-1 text-base leading-relaxed" lang={LANGS.find((l) => l.code === lang)?.bcp47} data-testid={`review-${k.split('.')[1]}`}>
            {txt}
          </p>
          <SpeakControls className="mt-1" text={txt} lang={lang} compact />
        </div>
      ))}
    </div>
  )
}

/** "3 days ago" in the coach's language. */
export function useAgo() {
  const { tc, now } = useApp()
  return (iso: string | null) => {
    if (!iso) return tc('coach.notYet')
    const days = Math.floor((Date.parse(now()) - Date.parse(iso)) / 86400_000)
    return days <= 0 ? tc('coach.today') : tc('coach.daysAgo', { n: days })
  }
}

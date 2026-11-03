// Weekly-challenge check-in at the start of the next session.
// Tap-first and voice-friendly; difficulties are picked from pictures/words, an optional short note can be added.
// Every message is supportive: incomplete work is never criticised.
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { CalendarX, CheckCircle2, CircleHelp, Clock, HelpCircle, Hourglass, Lock, MoreHorizontal, Store } from 'lucide-react'
import { ScreenShell } from '../components/ScreenShell'
import { AudioButton, Card, PrimaryButton, SecondaryButton } from '../components/ui'
import { LESSONS } from '../learning/storage'
import { challengeWording, type FollowUpPlan } from '../progress/challenges'
import { NoteRejected } from '../progress/engine'
import { DIFFICULTIES, type CheckInStatus, type Difficulty } from '../progress/types'
import { moduleOfLesson, useApp } from '../state/AppState'

const STATUS_ICON = { done: CheckCircle2, partly: Hourglass, notYet: Clock } as const
const DIFF_ICON: Record<Difficulty, typeof Clock> = { noTime: Clock, forgot: CircleHelp, hardToCount: HelpCircle, notClear: HelpCircle, shopClosed: Lock, other: MoreHorizontal }

export function CheckInScreen() {
  const app = useApp()
  const { t, lang, business, progress } = app
  const navigate = useNavigate()
  const [status, setStatus] = useState<CheckInStatus | null>(null)
  const [diffs, setDiffs] = useState<Difficulty[]>([])
  const [note, setNote] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [result, setResult] = useState<{ plan: FollowUpPlan; parent: string; accepted: boolean | null } | null>(null)
  const [record] = useState(() => progress.activeChallenge)

  if (!record) return <Navigate to="/home" replace />
  const activity = challengeWording(record.challengeId, lang, business)

  const submit = (s: CheckInStatus, withDiffs: Difficulty[], withNote?: string) => {
    try {
      const plan = app.checkIn(record.recordId, s, withDiffs, withNote)
      setResult({ plan, parent: record.recordId, accepted: null })
    } catch (e) {
      if (e instanceof NoteRejected) setNoteError(e.message === 'personal' ? t('ci.noteRejected') : t('ci.noteTooLong'))
      else throw e
    }
  }

  // 3. Supportive response + follow-up activity
  if (result) {
    const follow = result.plan.challengeId
    const followText = follow ? challengeWording(follow, lang, business) : ''
    const replayLesson = result.plan.suggestReplay && LESSONS[record.lessonId] ? moduleOfLesson(record.lessonId) : null
    return (
      <ScreenShell back="/home" title={t('ci.title')} footer={result.accepted !== null || !follow ? <PrimaryButton onClick={() => navigate('/home')}>{t('ci.home')}</PrimaryButton> : undefined}>
        <Card className="bg-leaf-soft" data-testid="ci-message" data-key={result.plan.messageKey}>
          <p className="text-xl font-semibold leading-relaxed">{t(result.plan.messageKey)}</p>
          <AudioButton className="mt-3" text={[t(result.plan.messageKey), follow ? `${t('ci.followUp')}: ${followText}` : t('ci.noFollowUp')].join(' ')} />
        </Card>
        {follow ? (
          <Card className="mt-4 border-l-4 border-marigold" data-testid="ci-followup" data-challenge={follow}>
            <div className="text-sm font-semibold uppercase tracking-wide text-[#8A5A12]">{t('ci.followUp')}</div>
            <p className="mt-1 text-lg leading-relaxed">{followText}</p>
            {result.accepted === null ? (
              <div className="mt-3 space-y-2">
                <PrimaryButton
                  data-testid="ci-accept"
                  onClick={() => {
                    app.acceptFollowUp(follow, result.parent)
                    setResult({ ...result, accepted: true })
                  }}
                >
                  {t('ci.accept')}
                </PrimaryButton>
                <SecondaryButton className="w-full" data-testid="ci-notnow" onClick={() => setResult({ ...result, accepted: false })}>
                  {t('ci.notNow')}
                </SecondaryButton>
              </div>
            ) : (
              <p className="mt-3 text-base font-semibold text-leaf" data-testid="ci-saved">
                {t('ci.saved')}
              </p>
            )}
          </Card>
        ) : (
          <p className="mt-4 text-lg leading-relaxed">{t('ci.noFollowUp')}</p>
        )}
        {replayLesson && (
          <SecondaryButton className="mt-4 w-full" data-testid="ci-replay" onClick={() => navigate(`/lessons/${replayLesson}`)}>
            {t('ci.replay')}
          </SecondaryButton>
        )}
      </ScreenShell>
    )
  }

  // 2. What made it hard? (optional)
  if (status && status !== 'done')
    return (
      <ScreenShell
        back="/home"
        title={t('ci.title')}
        footer={
          <div className="space-y-3">
            <PrimaryButton data-testid="ci-send" onClick={() => submit(status, diffs, note)}>
              {t('ci.send')}
            </PrimaryButton>
            <SecondaryButton className="w-full" data-testid="ci-skip" onClick={() => submit(status, [], undefined)}>
              {t('ci.skip')}
            </SecondaryButton>
          </div>
        }
      >
        <h2 className="text-2xl font-bold leading-snug">{t('ci.diffQ')}</h2>
        <AudioButton className="mt-2" text={[t('ci.diffQ'), ...DIFFICULTIES.map((d) => t(`ci.diff.${d}`))].join('. ')} />
        <div className="mt-4 grid grid-cols-2 gap-3">
          {DIFFICULTIES.map((d) => {
            const Icon = DIFF_ICON[d]
            const on = diffs.includes(d)
            return (
              <button
                key={d}
                data-testid={`diff-${d}`}
                aria-pressed={on}
                onClick={() => setDiffs(on ? diffs.filter((x) => x !== d) : [...diffs, d])}
                className={`flex min-h-[64px] items-center gap-2 rounded-2xl p-3 text-left text-base font-semibold leading-snug ring-2 ${on ? 'bg-brand-soft ring-brand' : 'bg-white ring-line'}`}
              >
                {d === 'shopClosed' ? <Store size={22} aria-hidden /> : d === 'noTime' ? <CalendarX size={22} aria-hidden /> : <Icon size={22} aria-hidden />}
                {t(`ci.diff.${d}`)}
              </button>
            )
          })}
        </div>
        <label className="mt-5 block">
          <span className="text-base font-semibold">{t('ci.note')}</span>
          <input
            data-testid="ci-note"
            lang={lang}
            maxLength={200}
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteError(null)
            }}
            className="mt-1 min-h-[52px] w-full rounded-xl bg-white px-3 text-lg outline-none ring-2 ring-line focus:ring-brand"
          />
          <span className="mt-1 block text-sm text-muted">{t('ci.noteHint')}</span>
        </label>
        {noteError && (
          <p role="alert" data-testid="ci-note-error" className="mt-2 rounded-xl bg-clay-soft p-3 text-base leading-relaxed">
            {noteError}
          </p>
        )}
      </ScreenShell>
    )

  // 1. Did you try it?
  return (
    <ScreenShell back="/home" title={t('ci.title')}>
      <Card className="border-l-4 border-marigold">
        <p className="text-lg leading-relaxed" data-testid="ci-activity">
          {activity}
        </p>
        <AudioButton className="mt-3" text={`${activity} ${t('ci.q')}`} />
      </Card>
      <h2 className="mt-5 text-2xl font-bold leading-snug">{t('ci.q')}</h2>
      <div className="mt-3 space-y-3">
        {(['done', 'partly', 'notYet'] as const).map((s) => {
          const Icon = STATUS_ICON[s]
          return (
            <button
              key={s}
              data-testid={`ci-${s}`}
              onClick={() => (s === 'done' ? submit('done', []) : setStatus(s))}
              className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-white p-4 text-left text-lg font-semibold ring-2 ring-line active:ring-brand"
            >
              <Icon size={26} className="shrink-0 text-brand" aria-hidden />
              {t(`ci.${s}`)}
            </button>
          )
        })}
      </div>
    </ScreenShell>
  )
}

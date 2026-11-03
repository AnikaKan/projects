// One learner's profile for the coordinator: who she is, what to work on today (with "Why this lesson?"),
// her weekly activity, progress, level, notes and coaching history. Everything is read from HER saved record.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, ShieldCheck } from 'lucide-react'
import { LANGS } from '../i18n/strings'
import { LESSON_CATALOG } from '../assessment/bank'
import { MVP_SEQUENCE } from '../assessment/engine'
import { conceptOfModule, lessonOfModule, moduleOfLesson, useApp } from '../state/AppState'
import { MODULE_EMOJI, STATE_EMOJI } from '../components/moduleVisuals'
import { challengeWording } from '../progress/challenges'
import { LEVEL_REASONS, VERIFY_RESULTS, type CoachLevel, type LearnerProfile, type LevelReason, type ProgressEvent } from '../progress/types'
import { notesOf, type CoachSummary } from '../coaching/model'
import { playLine } from '../coaching/playbook'
import { RecommendationCard } from './Recommendation'
import { BUSINESS_EMOJI, LevelChip, NoteForm, Section, StatusChip, useAgo } from './parts'

export function LearnerProfileView({ p, s }: { p: LearnerProfile; s: CoachSummary }) {
  const { tc, coachLang, progressOf, startSession } = useApp()
  const navigate = useNavigate()
  const v = progressOf(p.learnerId)!
  const name = p.alias[coachLang]
  const open = s.openSession

  return (
    <div className="flex flex-1 flex-col" data-testid="learner-detail" data-learner={p.learnerId}>
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <Link to="/coach" className="inline-flex min-h-[44px] items-center gap-1 text-base font-semibold text-brand md:hidden">
          <ChevronLeft size={20} aria-hidden /> {tc('cv.back')}
        </Link>

        {/* Who she is */}
        <div className="rounded-2xl bg-white p-4 ring-1 ring-line" data-testid="coach-profile">
          <div className="flex items-start gap-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-soft text-4xl" aria-hidden>
              {BUSINESS_EMOJI[p.business]}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-bold leading-snug">{name}</h2>
              <p className="text-xs font-bold uppercase tracking-wide text-[#8A5A12]">
                {tc('coach.fictional')} · {p.learnerId}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatusChip status={s.status} testid="profile-status" />
                <LevelChip level={s.level.value} none={s.level.source === 'none'} testid="profile-level" />
              </div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-paper p-2">
              <dt className="text-muted">{tc('cv.business')}</dt>
              <dd className="font-semibold">{tc(`biz.${p.business}`)}</dd>
            </div>
            <div className="rounded-xl bg-paper p-2">
              <dt className="text-muted">{tc('cv.lang')}</dt>
              <dd className="font-semibold" data-testid="coach-learner-lang">
                {LANGS.find((x) => x.code === p.language)!.native}
              </dd>
            </div>
          </dl>
          <button
            data-testid="open-learner-app"
            onClick={() => {
              startSession(p.learnerId)
              navigate('/home')
            }}
            className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-paper px-4 text-sm font-bold text-brand ring-1 ring-brand/40"
          >
            📱 {tc('cv.openApp')}
          </button>
          {s.status !== 'doingWell' && (
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="profile-reasons">
              {s.reasons.map((r) => (
                <li key={r} className="rounded-full bg-paper px-2.5 py-1 text-sm ring-1 ring-line">
                  {tc(`cv.reason.${r}`)}
                </li>
              ))}
            </ul>
          )}
        </div>

        <RecommendationCard p={p} s={s} />
        <ChallengeSection p={p} s={s} />
        <ProgressSection s={s} v={v} />
        <LevelSection p={p} s={s} />
        <Section title={tc('cv.notes')} icon="📝" testid="coach-notes">
          <NotesList p={p} />
          <details className="mt-3">
            <summary className="min-h-[44px] cursor-pointer py-2 text-base font-bold text-brand" data-testid="add-note">
              + {tc('cv.addNote')}
            </summary>
            <NoteForm learnerId={p.learnerId} />
          </details>
        </Section>
        <History p={p} />

        <p className="flex items-center gap-2 text-xs text-muted">
          <ShieldCheck size={14} aria-hidden /> {tc('coach.privacyLong')}
        </p>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-paper p-4">
        <button
          data-testid="start-session"
          data-resume={!!open}
          onClick={() => navigate(`/coach/learner/${p.learnerId}/session`)}
          className="min-h-[60px] w-full rounded-full bg-brand px-5 text-lg font-bold leading-snug text-white active:bg-brand-dark"
        >
          {open ? `▶ ${tc('cv.resumeSession', { n: ['checkin', 'review', 'teach', 'practice', 'action'].indexOf(open.step) + 1 })}` : `▶ ${tc('cv.startSession')}`}
        </button>
      </div>
    </div>
  )
}

function ChallengeSection({ p, s }: { p: LearnerProfile; s: CoachSummary }) {
  const { tc, coachLang, verifyChallenge } = useApp()
  const ago = useAgo()
  const c = s.challenge
  const name = p.alias[coachLang]
  const fu =
    c.followUpRule === 'F2_VERIFY' && c.last
      ? playLine(coachLang, c.last.concept, s.level.value, 'verify', { name, business: p.business })
      : tc(`cv.fu.${c.followUpRule}`, { name })
  return (
    <Section title={tc('cv.ch.title')} icon="🗓️" testid="coach-challenges">
      {c.last ? (
        <div className="space-y-2" data-testid={`challenge-${c.last.recordId}`} data-status={c.last.status} data-display={c.displayStatus}>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">{tc('cv.ch.last')}</div>
          <p className="text-base leading-relaxed">{challengeWording(c.last.challengeId, coachLang, p.business)}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className={`rounded-full px-2.5 py-1 font-bold ${c.displayStatus === 'completed' ? 'bg-leaf-soft text-leaf' : c.displayStatus === 'notChecked' ? 'bg-line/70' : 'bg-clay-soft text-clay'}`} data-testid="challenge-status">
              {tc(`cv.chs.${c.displayStatus}`)}
            </span>
            <span className="text-muted">{tc('coach.chAssigned', { d: ago(c.last.assignedAt) })}</span>
            {c.last.checkIn && <span className="text-muted">· {tc(c.last.status === 'done' ? 'ch.done' : c.last.status === 'partly' ? 'ch.partly' : 'ch.notYet')}</span>}
          </div>
          {!!c.last.checkIn?.difficulties.length && (
            <p className="text-sm" data-testid="challenge-barriers">
              <span className="font-semibold">{tc('cv.ch.barriers')}:</span> {c.last.checkIn.difficulties.map((d) => tc(`ci.diff.${d}`)).join(', ')}
            </p>
          )}
          {c.last.checkIn?.note && <p className="text-sm italic text-muted">“{c.last.checkIn.note}”</p>}
          {c.displayStatus === 'completed' && (
            <div className="rounded-xl bg-paper p-3 ring-1 ring-line" data-testid="verify-box" data-verified={c.verification ?? 'none'}>
              <p className="text-sm font-semibold">{tc('cv.ch.doneNote')}</p>
              <p className="mt-1 text-sm font-bold">{tc('cv.ch.verifyQ')}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {VERIFY_RESULTS.map((r) => (
                  <button
                    key={r}
                    data-testid={`verify-${r}`}
                    aria-pressed={c.verification === r}
                    onClick={() => verifyChallenge(p.learnerId, c.last!.recordId, r)}
                    className={`min-h-[44px] rounded-full px-3 text-sm font-semibold ${c.verification === r ? 'bg-brand text-white' : 'bg-white ring-1 ring-line'}`}
                  >
                    {tc(`cv.verify.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-base text-muted">{tc('cv.ch.none')}</p>
      )}
      <div className="mt-3 rounded-xl bg-brand-soft p-3" data-testid="challenge-followup" data-rule={c.followUpRule}>
        <div className="text-xs font-bold uppercase tracking-wide text-brand">👉 {tc('cv.ch.followUp')}</div>
        <p className="mt-1 text-base font-semibold leading-relaxed">{fu}</p>
      </div>
      {c.next && (
        <div className="mt-3" data-testid="challenge-next" data-challenge={c.next.challengeId} data-agreed={c.next.agreed}>
          <div className="text-xs font-bold uppercase tracking-wide text-muted">
            {tc('cv.ch.next')} · {tc(c.next.agreed ? 'cv.ch.agreed' : 'cv.ch.suggested')}
          </div>
          <p className="mt-1 text-base leading-relaxed">{challengeWording(c.next.challengeId, coachLang, p.business)}</p>
        </div>
      )}
    </Section>
  )
}

function ProgressSection({ s, v }: { s: CoachSummary; v: NonNullable<ReturnType<ReturnType<typeof useApp>['progressOf']>> }) {
  const { tc } = useApp()
  const ago = useAgo()
  const total = LESSON_CATALOG.length
  const order = MVP_SEQUENCE.map((c) => LESSON_CATALOG.find((l) => l.concept === c)!.moduleId)
  return (
    <Section title={tc('cv.progress')} icon="🌱" testid="coach-progress">
      <div className="flex items-center justify-between gap-2" data-testid="lessons-done" data-count={s.lessonsCompleted.length}>
        <span className="text-base font-semibold">{tc('cv.lessonsDone')}</span>
        <span className="flex items-center gap-1" aria-label={tc('cv.lessonsDoneN', { n: s.lessonsCompleted.length, total })}>
          {order.map((m) => (
            <span key={m} className={`h-3.5 w-7 rounded-full ${v.lessons[lessonOfModule(m)].completions ? 'bg-leaf' : 'bg-line'}`} />
          ))}
          <span className="ml-1 text-sm font-bold">{tc('cv.lessonsDoneN', { n: s.lessonsCompleted.length, total })}</span>
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-leaf-soft p-3" data-testid="concepts-understood">
          <div className="text-sm font-bold text-leaf">✅ {tc('cv.understood')}</div>
          <p className="mt-1 text-sm">{s.understood.length ? s.understood.map((c) => tc(`${LESSON_CATALOG.find((l) => l.concept === c)!.moduleId}.title`)).join(', ') : tc('cv.none')}</p>
        </div>
        <div className="rounded-xl bg-clay-soft p-3" data-testid="concepts-practice">
          <div className="text-sm font-bold text-clay">🔁 {tc('cv.needsPractice')}</div>
          <p className="mt-1 text-sm">{s.needsPractice.length ? s.needsPractice.map((c) => tc(`${LESSON_CATALOG.find((l) => l.concept === c)!.moduleId}.title`)).join(', ') : tc('cv.none')}</p>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line" data-testid="coach-lessons">
        {order.map((m) => {
          const c = v.concepts[conceptOfModule(m)]
          const l = v.lessons[lessonOfModule(m)]
          return (
            <li key={m} className="flex items-center gap-2 py-2" data-testid={`concept-${m}`} data-level={c.level} data-needs-practice={c.needsPractice}>
              <span className="text-xl" aria-hidden>
                {MODULE_EMOJI[m]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold leading-snug">{tc(`${m}.title`)}</span>
                <span className="block text-xs text-muted" data-testid={`lesson-${m}`} data-status={l.status} data-starts={l.starts} data-completions={l.completions}>
                  {tc(`lstatus.${l.status}`)}
                  {l.lastResult ? ` · ${tc(`result.${l.lastResult}`)}` : ''}
                  {c.attempts ? ` · ${tc('coach.answers', { c: c.correct, n: c.attempts })}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold" title={tc(`state.${c.level}`)}>
                <span aria-hidden>{STATE_EMOJI[c.level]} </span>
                {tc(`state.${c.level}`)}
              </span>
            </li>
          )
        })}
      </ul>

      <div className="mt-3" data-testid="coach-misconceptions">
        <div className="text-sm font-bold">{tc('cv.mistakes')}</div>
        {v.misconceptions.length ? (
          <ul className="mt-1 space-y-1">
            {[...v.misconceptions].sort((a, b) => Number(a.resolved) - Number(b.resolved)).map((m) => (
              <li key={m.code} className={`rounded-lg px-3 py-2 text-sm ${m.resolved ? 'bg-leaf-soft' : 'bg-clay-soft'}`} data-testid={`mis-${m.code}`} data-resolved={m.resolved}>
                <span className="font-semibold">{tc(m.resolved ? 'cv.mistakeResolved' : 'cv.mistakeOpen')}:</span> {tc(`mis.${m.code}`)} <span className="text-xs text-muted">({tc('coach.seen', { n: m.count })})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{tc('cv.noMistakes')}</p>
        )}
      </div>

      <p className="mt-3 text-sm text-muted" data-testid="coach-assessment" data-tier={v.assessment.latest?.tier ?? 'none'}>
        <span className="font-semibold text-ink">{tc('cv.firstCheck')}:</span>{' '}
        {v.assessment.latest
          ? `${ago(v.assessment.latest.at)} · ${tc(`cv.level.${v.assessment.latest.tier ?? 'foundational'}`)}${v.assessment.latest.misconceptions.length ? ` · ${tc('level.gap')}: ${v.assessment.latest.misconceptions.map((m) => tc(`mis.${m}`)).join('; ')}` : ''}`
          : tc('cv.notChecked')}
      </p>
    </Section>
  )
}

function LevelSection({ p, s }: { p: LearnerProfile; s: CoachSummary }) {
  const { tc, setLevel } = useApp()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<CoachLevel>(s.level.value === 'foundational' ? 'intermediate' : 'foundational')
  const [reason, setReason] = useState<LevelReason | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = (level: CoachLevel | null) => {
    if (!reason) return
    try {
      setLevel(p.learnerId, level, reason, note)
      setOpen(false)
      setReason(null)
      setNote('')
    } catch {
      setError(tc('coach.noteRejected'))
    }
  }
  return (
    <Section title={tc('cv.lv.title')} icon={s.level.value === 'foundational' ? '🌱' : '🌿'} testid="coach-level" right={<LevelChip level={s.level.value} none={s.level.source === 'none'} />}>
      <p className="text-sm text-muted" data-testid="level-source" data-source={s.level.source}>
        {tc(`cv.levelSource.${s.level.source}`)} · {tc('cv.lv.noAuto')}
      </p>
      {s.level.suggestion && (
        <p className="mt-2 rounded-xl bg-marigold-soft p-3 text-sm font-semibold" data-testid="level-suggestion" data-suggestion={s.level.suggestion}>
          💡 {s.level.suggestion === 'moveUp' ? tc('cv.lv.moveUp', { n: s.level.independentCorrect }) : tc('cv.lv.moveDown')}
        </p>
      )}
      {!open ? (
        <button data-testid="level-change" onClick={() => setOpen(true)} className="mt-2 min-h-[44px] rounded-full px-4 text-sm font-bold text-brand ring-1 ring-brand/40">
          {tc('cv.lv.change')}
        </button>
      ) : (
        <div className="mt-2 space-y-2 rounded-xl bg-paper p-3" data-testid="level-form">
          <fieldset>
            <legend className="text-sm font-bold">{tc('cv.lv.to')}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(['foundational', 'intermediate'] as CoachLevel[]).map((l) => (
                <label key={l} className={`flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm ring-1 ${to === l ? 'bg-brand-soft ring-brand' : 'bg-white ring-line'}`}>
                  <input type="radio" name="lvto" checked={to === l} onChange={() => setTo(l)} data-testid={`level-to-${l}`} />
                  {tc(`cv.level.${l}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-bold">{tc('cv.lv.reason')}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {LEVEL_REASONS.map((r) => (
                <label key={r} className={`flex min-h-[44px] items-center gap-2 rounded-full px-3 text-sm ring-1 ${reason === r ? 'bg-brand-soft ring-brand' : 'bg-white ring-line'}`}>
                  <input type="radio" name="lvreason" checked={reason === r} onChange={() => setReason(r)} data-testid={`level-reason-${r}`} />
                  {tc(`cv.lvr.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={tc('cv.noteText')} className="min-h-[44px] w-full rounded-xl bg-white px-3 text-sm ring-1 ring-line" data-testid="level-note" />
          {error && <p role="alert" className="text-sm text-clay">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button data-testid="level-save" disabled={!reason || to === s.level.value} onClick={() => save(to)} className="min-h-[44px] rounded-full bg-brand px-4 text-sm font-bold text-white disabled:bg-disabled disabled:text-disabled-ink">
              {tc('cv.lv.save')}
            </button>
            {s.level.source === 'coach' && (
              <button data-testid="level-revert" disabled={!reason} onClick={() => save(null)} className="min-h-[44px] rounded-full bg-white px-4 text-sm font-bold text-brand ring-1 ring-brand/40 disabled:opacity-50">
                {tc('cv.lv.revert')}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="min-h-[44px] rounded-full px-4 text-sm font-semibold text-muted">
              {tc('coach.cancel')}
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

function NotesList({ p }: { p: LearnerProfile }) {
  const { tc } = useApp()
  const ago = useAgo()
  const notes = notesOf(p)
  if (!notes.length) return <p className="text-sm text-muted">{tc('cv.noNotes')}</p>
  return (
    <ul className="space-y-1.5" data-testid="notes-list">
      {notes.slice(0, 5).map((n, i) => (
        <li key={i} className="rounded-xl bg-paper px-3 py-2 text-sm ring-1 ring-line">
          <span className="text-xs text-muted">{ago(n.at)} · </span>
          {n.categories.map((c) => tc(`cv.note.${c}`)).join(' · ')}
          {n.text && <span className="italic"> “{n.text}”</span>}
        </li>
      ))}
    </ul>
  )
}

type LogEv = Extract<ProgressEvent, { type: 'coach_override' | 'coach_reviewed_lesson' | 'coach_accepted' | 'coach_level_set' | 'coach_session_completed' }>

function History({ p }: { p: LearnerProfile }) {
  const { tc } = useApp()
  const ago = useAgo()
  const title = (lessonId: string) => tc(`${moduleOfLesson(lessonId as never)}.title`)
  const log = p.events.filter((e): e is LogEv => ['coach_override', 'coach_reviewed_lesson', 'coach_accepted', 'coach_level_set', 'coach_session_completed'].includes(e.type)).reverse()
  return (
    <Section title={tc('cv.history')} icon="🕘" testid="coach-log">
      {!log.length ? (
        <p className="text-sm text-muted">{tc('cv.h.empty')}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {log.slice(0, 8).map((e, i) => (
            <li key={i} data-type={e.type}>
              {e.type === 'coach_reviewed_lesson'
                ? tc('coach.logReviewed', { d: ago(e.at), m: title(e.lessonId) })
                : e.type === 'coach_accepted'
                  ? tc('cv.h.accepted', { d: ago(e.at), lesson: title(e.lessonId), level: tc(`cv.level.${e.level}`) })
                  : e.type === 'coach_level_set'
                    ? e.level
                      ? tc('cv.h.level', { d: ago(e.at), level: tc(`cv.level.${e.level}`), reason: tc(`cv.lvr.${e.reason}`) })
                      : tc('cv.h.levelRevert', { d: ago(e.at), reason: tc(`cv.lvr.${e.reason}`) })
                    : e.type === 'coach_session_completed'
                      ? tc('cv.h.session', { d: ago(e.at) })
                      : e.toLessonId
                        ? tc('coach.logOverride', { d: ago(e.at), from: title(e.fromLessonId), to: title(e.toLessonId), reason: tc(`override.${e.reason}`) })
                        : tc('coach.logRevert', { d: ago(e.at), reason: tc(`override.${e.reason}`) })}
              {(e.type === 'coach_override' || e.type === 'coach_level_set') && e.note ? ` — “${e.note}”` : ''}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}


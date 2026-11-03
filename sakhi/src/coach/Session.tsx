// Guided 20-minute coaching session: Check in → Review → Teach → Practice → Action.
// Short prompts, big buttons; learner-facing content is in HER language (switchable en/hi/te) and can be
// played aloud. Everything she does is saved to her record as it happens, so the session can be paused,
// resumed, and still counts toward her progress if the coach stops early.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { LESSON_CATALOG } from '../assessment/bank'
import type { Concept, LessonId } from '../assessment/types'
import type { Lang } from '../i18n/strings'
import { useApp, moduleOfLesson } from '../state/AppState'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import { SpeakControls } from '../components/speech/SpeakControls'
import { LESSONS } from '../learning/storage'
import { CHALLENGES, challengeWording } from '../progress/challenges'
import { CHECKIN_STATUSES, DIFFICULTIES, SESSION_STEPS, VERIFY_RESULTS, type CheckInStatus, type CoachLevel, type Difficulty, type LearnerProfile, type SessionStep } from '../progress/types'
import type { CoachSummary } from '../coaching/model'
import { exampleAmounts, playLine } from '../coaching/playbook'
import { practiceFor } from '../coaching/sessionContent'
import { LangToggle, LessonParts, NoteForm } from './parts'

const STEP_ICON: Record<SessionStep, string> = { checkin: '👋', review: '🔁', teach: '📖', practice: '✏️', action: '🚩' }
const STEP_MIN: Record<SessionStep, number> = { checkin: 3, review: 4, teach: 6, practice: 4, action: 3 }
const conceptOf = (lessonId: string) => LESSON_CATALOG.find((l) => l.id === lessonId)!.concept

/** What this session works on, fixed when it starts (so content does not shift while she is answering). */
interface Plan {
  lessonId: LessonId
  level: CoachLevel
  topic: Concept | 'start'
}

export function CoachingSession({ p, s }: { p: LearnerProfile; s: CoachSummary }) {
  const { tc, coachLang, startCoachSession, setSessionStep, pauseSession, completeSession } = useApp()
  const navigate = useNavigate()
  const [sessionId, setSessionId] = useState<string | null>(() => s.openSession?.sessionId ?? null)
  const started = useRef(false)
  const [lang, setLang] = useState<Lang>(p.language)
  const [finished, setFinished] = useState<string | null>(null)

  useEffect(() => {
    // Start a new session, or resume the open one (startCoachSession returns it). Runs once per mount.
    if (sessionId || started.current) return
    started.current = true
    setSessionId(startCoachSession(p.learnerId))
  }, [p.learnerId, startCoachSession, sessionId])

  const view = s.sessions.find((x) => x.sessionId === (finished ?? sessionId))
  if (!sessionId || !view) return null
  const name = p.alias[coachLang]

  if (finished || view.status === 'completed') {
    return (
      <div className="flex-1 space-y-4 p-4 md:p-6" data-testid="session-done" data-session={view.sessionId}>
        <div className="rounded-2xl bg-leaf-soft p-5 text-center ring-1 ring-leaf/40">
          <div className="text-5xl" aria-hidden>
            ✅
          </div>
          <h2 className="mt-2 text-2xl font-bold">{tc('cv.s.completed')}</h2>
          <p className="mt-1 text-base">{tc('cv.s.completedBody', { name })}</p>
        </div>
        <Recorded view={view} />
        <Link to={`/coach/learner/${p.learnerId}`} data-testid="session-to-profile" className="flex min-h-[56px] items-center justify-center rounded-full bg-brand px-5 text-lg font-bold text-white">
          {tc('cv.s.toProfile')}
        </Link>
      </div>
    )
  }

  const plan: Plan = { lessonId: view.lessonId, level: view.level, topic: view.ruleId === 'R0_NO_HISTORY' ? 'start' : conceptOf(view.lessonId) }
  const idx = SESSION_STEPS.indexOf(view.step)
  const go = (step: SessionStep) => setSessionStep(p.learnerId, sessionId, step)
  const pause = () => {
    pauseSession(p.learnerId, sessionId)
    navigate(`/coach/learner/${p.learnerId}`)
  }

  return (
    <div className="flex flex-1 flex-col" data-testid="coach-session" data-session={sessionId} data-step={view.step} data-learner={p.learnerId}>
      <div className="flex-1 space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/coach/learner/${p.learnerId}`} onClick={() => pauseSession(p.learnerId, sessionId)} className="inline-flex min-h-[44px] items-center gap-1 text-base font-semibold text-brand">
            <ChevronLeft size={20} aria-hidden /> {name}
          </Link>
          <button data-testid="session-pause" onClick={pause} className="min-h-[44px] rounded-full px-4 text-sm font-bold text-brand ring-1 ring-brand/40">
            💾 {tc('cv.s.pause')}
          </button>
        </div>
        <div>
          <h2 className="text-2xl font-bold leading-snug">
            {tc('cv.s.title')} · {name}
          </h2>
          <p className="text-sm text-muted" data-testid="session-step-label">
            {tc('cv.s.stepOf', { n: idx + 1, m: STEP_MIN[view.step] })}
          </p>
        </div>
        <ol className="grid grid-cols-5 gap-1.5" data-testid="session-stepper">
          {SESSION_STEPS.map((st, i) => (
            <li key={st}>
              <button
                data-testid={`session-go-${st}`}
                aria-current={st === view.step ? 'step' : undefined}
                onClick={() => go(st)}
                className={`flex min-h-[64px] w-full flex-col items-center justify-center rounded-xl text-xs font-bold leading-tight ${
                  st === view.step ? 'bg-brand text-white' : view.visited.includes(st) ? 'bg-brand-soft text-brand' : 'bg-white text-muted ring-1 ring-line'
                }`}
              >
                <span className="text-xl" aria-hidden>
                  {STEP_ICON[st]}
                </span>
                <span>
                  {i + 1}. {tc(`cv.s.step.${st}`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-line">
          <span className="text-sm font-semibold">{tc('cv.s.learnerLang')}:</span>
          <LangToggle value={lang} onChange={setLang} mark={p.language} testidPrefix="session-lang" />
        </div>

        <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
          {view.step === 'checkin' && <CheckinStep p={p} s={s} lang={lang} />}
          {view.step === 'review' && <ReviewStep p={p} s={s} plan={plan} lang={lang} />}
          {view.step === 'teach' && <TeachStep p={p} plan={plan} lang={lang} sessionId={sessionId} />}
          {view.step === 'practice' && <PracticeStep key={lang} p={p} plan={plan} lang={lang} sessionId={sessionId} />}
          {view.step === 'action' && <ActionStep p={p} s={s} plan={plan} lang={lang} sessionId={sessionId} />}
        </div>
        {view.step === 'action' && <Recorded view={view} />}
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-line bg-paper p-4">
        <button
          data-testid="session-back"
          disabled={idx === 0}
          onClick={() => go(SESSION_STEPS[idx - 1])}
          className="min-h-[56px] rounded-full bg-white px-5 text-base font-bold text-brand ring-1 ring-brand/40 disabled:opacity-40"
        >
          {tc('cv.s.back')}
        </button>
        {idx < SESSION_STEPS.length - 1 ? (
          <button data-testid="session-next" onClick={() => go(SESSION_STEPS[idx + 1])} className="min-h-[56px] flex-1 rounded-full bg-brand px-5 text-lg font-bold text-white active:bg-brand-dark">
            {tc('cv.s.next')} · {tc(`cv.s.step.${SESSION_STEPS[idx + 1]}`)}
          </button>
        ) : (
          <button
            data-testid="session-complete"
            onClick={() => {
              completeSession(p.learnerId, sessionId)
              setFinished(sessionId)
            }}
            className="min-h-[56px] flex-1 rounded-full bg-leaf px-5 text-lg font-bold text-white"
          >
            ✓ {tc('cv.s.complete')}
          </button>
        )}
      </div>
    </div>
  )
}

function Recorded({ view }: { view: CoachSummary['sessions'][number] }) {
  const { tc } = useApp()
  const r = view.recorded
  const items = [
    r.checkedIn || r.verified ? tc('cv.s.rCheck') : null,
    r.practiced ? tc('cv.s.rPractice', { c: r.practiceCorrect, n: r.practiced }) : null,
    r.assigned ? tc('cv.s.rActivity') : null,
    r.notes ? tc('cv.s.rNote') : null,
  ].filter(Boolean)
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line" data-testid="session-recorded">
      <div className="text-sm font-bold">{tc('cv.s.recorded')}</div>
      {items.length ? (
        <ul className="mt-1 space-y-0.5 text-base">
          {items.map((x) => (
            <li key={x}>✓ {x}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{tc('cv.s.rNothing')}</p>
      )}
    </div>
  )
}

function StepTitle({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-xl font-bold leading-snug">
      <span aria-hidden>{icon}</span>
      {children}
    </h3>
  )
}

function CheckinStep({ p, s, lang }: { p: LearnerProfile; s: CoachSummary; lang: Lang }) {
  const { tc, coachLang, coachCheckIn, verifyChallenge } = useApp()
  const c = s.challenge
  const [status, setStatus] = useState<CheckInStatus | null>(null)
  const [diffs, setDiffs] = useState<Difficulty[]>([])
  if (!c.last) return <p className="text-lg" data-testid="session-no-challenge">{tc('cv.s.noChallenge')}</p>
  const text = challengeWording(c.last.challengeId, lang, p.business)
  const open = c.last.status === 'assigned'
  return (
    <div data-testid="step-checkin">
      <StepTitle icon="👋">{tc('cv.s.checkinQ')}</StepTitle>
      <p className="rounded-xl bg-paper p-3 text-base leading-relaxed" lang={lang}>
        {text}
      </p>
      <SpeakControls className="mt-2" text={text} lang={lang} compact label={tc('cv.s.sayToHer')} />
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {CHECKIN_STATUSES.map((x) => (
              <button
                key={x}
                data-testid={`session-ci-${x}`}
                aria-pressed={status === x}
                onClick={() => setStatus(x)}
                className={`min-h-[64px] rounded-2xl px-2 text-base font-bold ${status === x ? 'bg-brand text-white' : 'bg-white ring-1 ring-line'}`}
              >
                {x === 'done' ? '✅' : x === 'partly' ? '🌗' : '⏳'} {tc(`cv.chs.${x === 'done' ? 'completed' : x === 'partly' ? 'partly' : 'notCompleted'}`)}
              </button>
            ))}
          </div>
          {status && status !== 'done' && (
            <div>
              <div className="text-sm font-bold">{tc('cv.s.barriersQ')}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    data-testid={`session-diff-${d}`}
                    aria-pressed={diffs.includes(d)}
                    onClick={() => setDiffs(diffs.includes(d) ? diffs.filter((x) => x !== d) : [...diffs, d])}
                    className={`min-h-[44px] rounded-full px-3 text-sm font-semibold ${diffs.includes(d) ? 'bg-brand text-white' : 'bg-paper ring-1 ring-line'}`}
                  >
                    {tc(`ci.diff.${d}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            data-testid="session-ci-save"
            disabled={!status}
            onClick={() => status && coachCheckIn(p.learnerId, c.last!.recordId, status, status === 'done' ? [] : diffs)}
            className="min-h-[52px] rounded-full bg-brand px-6 text-base font-bold text-white disabled:bg-disabled disabled:text-disabled-ink"
          >
            {tc('cv.s.save')}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-base font-bold" data-testid="session-ci-saved">
            {tc('cv.s.checked', { status: tc(`cv.chs.${c.displayStatus}`) })}
            {c.last.checkIn?.difficulties.length ? ` · ${c.last.checkIn.difficulties.map((d) => tc(`ci.diff.${d}`)).join(', ')}` : ''}
          </p>
          {c.displayStatus === 'completed' && (
            <div className="rounded-xl bg-paper p-3">
              <p className="text-sm">{tc('cv.ch.doneNote')}</p>
              <p className="mt-1 text-sm font-semibold">{playLine(coachLang, c.last.concept, s.level.value, 'verify', { name: p.alias[coachLang], business: p.business })}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VERIFY_RESULTS.map((r) => (
                  <button
                    key={r}
                    data-testid={`session-verify-${r}`}
                    aria-pressed={c.verification === r}
                    onClick={() => verifyChallenge(p.learnerId, c.last!.recordId, r)}
                    className={`min-h-[48px] rounded-full px-4 text-base font-semibold ${c.verification === r ? 'bg-brand text-white' : 'bg-white ring-1 ring-line'}`}
                  >
                    {tc(`cv.verify.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {c.followUpRule !== 'F2_VERIFY' && <p className="rounded-xl bg-brand-soft p-3 text-base font-semibold">👉 {tc(`cv.fu.${c.followUpRule}`, { name: p.alias[coachLang] })}</p>}
        </div>
      )}
    </div>
  )
}

function Picture({ business, show }: { business: LearnerProfile['business']; show: boolean }) {
  const { tc } = useApp()
  const a = exampleAmounts(business)
  const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)
  const cell = 'flex flex-col items-center rounded-2xl bg-white px-3 py-2 ring-2 ring-line'
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="review-picture" aria-hidden>
      <span className={cell}>
        <span className="text-3xl">🧺</span>
        <span className="text-xl font-bold">{inr(a.sales)}</span>
        <span className="text-xs font-semibold text-muted">{tc('pr.sales')}</span>
      </span>
      <span className="text-3xl font-bold text-muted">−</span>
      <span className={cell}>
        <span className="text-3xl">📦</span>
        <span className="text-xl font-bold">{inr(a.cost)}</span>
        <span className="text-xs font-semibold text-muted">{tc('cv.s.cost')}</span>
      </span>
      <span className="text-3xl font-bold text-muted">=</span>
      <span className={`flex flex-col items-center rounded-2xl px-3 py-2 ring-2 ${show ? 'bg-leaf-soft ring-leaf' : 'bg-marigold-soft ring-marigold'}`}>
        <span className="text-3xl">💰</span>
        <span className="text-xl font-bold">{show ? inr(a.left) : '?'}</span>
        <span className="text-xs font-semibold text-muted">{tc('cv.s.left')}</span>
      </span>
    </div>
  )
}

function ReviewStep({ p, s, plan, lang }: { p: LearnerProfile; s: CoachSummary; plan: Plan; lang: Lang }) {
  const { tc, coachLang, progressOf } = useApp()
  const [show, setShow] = useState(false)
  const topic = plan.topic
  const concept = topic === 'start' ? 'revenue_vs_profit' : topic
  // The difficulty she had on this topic: still open first, else the most recent one (from her record).
  const seen = (progressOf(p.learnerId)?.misconceptions ?? []).filter((m) => m.concept === concept)
  const mis = (seen.find((m) => !m.resolved) ?? seen.at(-1))?.code ?? s.recommendation.misconceptionIds[0]
  const learn = playLine(lang, concept, plan.level, 'learn', { name: p.alias[lang], business: p.business })
  const ask = playLine(coachLang, topic, plan.level, 'question', { name: p.alias[coachLang], business: p.business })
  const picture = concept === 'revenue_vs_profit' || concept === 'business_expenses'
  return (
    <div data-testid="step-review" data-mis={mis ?? 'none'}>
      <StepTitle icon="🔁">{mis ? tc('cv.s.reviewTitle', { mis: tc(`mis.${mis}`) }) : tc('cv.s.reviewPlain')}</StepTitle>
      {!mis && <p className="mb-2 text-sm text-muted">{tc('cv.s.reviewNoMis')}</p>}
      {picture && (
        <div className="mb-3">
          <Picture business={p.business} show={show} />
          <button data-testid="review-reveal" onClick={() => setShow(!show)} className="mt-2 min-h-[44px] rounded-full px-4 text-sm font-bold text-brand ring-1 ring-brand/40">
            💰 {show ? tc('cv.s.hide') : tc('cv.s.reveal')}
          </button>
        </div>
      )}
      <p className="rounded-xl bg-paper p-3 text-lg leading-relaxed" lang={lang} data-testid="review-learn">
        {learn}
      </p>
      <SpeakControls className="mt-2" text={learn} lang={lang} compact label={tc('cv.s.sayToHer')} />
      <p className="mt-3 rounded-xl bg-brand-soft p-3 text-base font-semibold">
        ❓ {tc('cv.s.askHer')}: {ask}
      </p>
    </div>
  )
}

function TeachStep({ p, plan, lang, sessionId }: { p: LearnerProfile; plan: Plan; lang: Lang; sessionId: string }) {
  const { tc, coachLang, pauseSession, openLearnerApp } = useApp()
  const navigate = useNavigate()
  const m = moduleOfLesson(plan.lessonId)
  const content = LESSONS[plan.lessonId]
  const start = plan.topic === 'start'
  const handOver = (path: string) => {
    pauseSession(p.learnerId, sessionId)
    openLearnerApp(p.learnerId)
    navigate(path)
  }
  return (
    <div data-testid="step-teach" data-lesson={plan.lessonId}>
      <StepTitle icon={MODULE_EMOJI[m]}>{start ? tc('cv.s.teachOpenCheck') : tc(`${m}.title`)}</StepTitle>
      {start ? (
        <>
          <p className="text-base">{playLine(coachLang, 'start', plan.level, 'activity', { name: p.alias[coachLang], business: p.business })}</p>
          <button data-testid="teach-open-check" onClick={() => handOver('/assessment')} className="mt-3 min-h-[56px] w-full rounded-full bg-brand px-5 text-lg font-bold text-white">
            ▶ {tc('cv.s.teachOpenCheck')}
          </button>
          <p className="mt-2 text-sm text-muted">{tc('cv.s.teachNote')}</p>
        </>
      ) : content ? (
        <>
          <button data-testid="teach-open-lesson" onClick={() => handOver(`/lessons/${m}`)} className="min-h-[56px] w-full rounded-full bg-brand px-5 text-lg font-bold text-white">
            ▶ {tc('cv.s.teachOpen')}
          </button>
          <p className="mt-2 text-sm text-muted">{tc('cv.s.teachNote')}</p>
          <div className="mt-3">
            <LessonParts p={p} lessonId={plan.lessonId} lang={lang} />
          </div>
        </>
      ) : (
        <div data-testid="teach-no-content">
          <p className="rounded-xl bg-marigold-soft p-3 text-base font-semibold">👩‍🏫 {tc('cv.noLessonYet')}</p>
          <p className="mt-3 text-base font-semibold">{playLine(coachLang, conceptOf(plan.lessonId), plan.level, 'activity', { name: p.alias[coachLang], business: p.business })}</p>
          {(() => {
            const learn = playLine(lang, conceptOf(plan.lessonId), plan.level, 'learn', { name: p.alias[lang], business: p.business })
            return (
              <>
                <p className="mt-3 rounded-xl bg-paper p-3 text-lg leading-relaxed" lang={lang}>
                  {learn}
                </p>
                <SpeakControls className="mt-2" text={learn} lang={lang} compact label={tc('cv.s.sayToHer')} />
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function PracticeStep({ p, plan, lang, sessionId }: { p: LearnerProfile; plan: Plan; lang: Lang; sessionId: string }) {
  const { tc, recordSessionPractice } = useApp()
  const concept: Concept = plan.topic === 'start' ? 'revenue_vs_profit' : plan.topic
  const q = practiceFor(concept, plan.level, p.business, lang)
  const [picked, setPicked] = useState<string | null>(null)
  const opt = q.options.find((o) => o.id === picked)
  return (
    <div data-testid="step-practice" data-question={q.question}>
      <StepTitle icon="✏️">{tc('cv.s.practiceTitle')}</StepTitle>
      <p className="text-sm text-muted">{tc('cv.s.practiceLevel', { level: tc(`cv.level.${plan.level}`) })}</p>
      <p className="mt-2 rounded-xl bg-paper p-3 text-xl font-semibold leading-relaxed" lang={lang} data-testid="practice-text">
        {q.text}
      </p>
      <SpeakControls className="mt-2" text={`${q.text} ${q.options.map((o) => o.label).join(', ')}`} lang={lang} compact label={tc('cv.s.sayToHer')} />
      <p className="mt-3 text-sm font-bold">{tc('cv.s.practiceTap')}</p>
      <div className="mt-1 grid gap-2">
        {q.options.map((o) => (
          <button
            key={o.id}
            data-testid={`practice-opt-${o.id}`}
            data-outcome={o.outcome}
            disabled={!!picked}
            onClick={() => {
              setPicked(o.id)
              recordSessionPractice(p.learnerId, sessionId, { concept: q.concept, question: q.question, outcome: o.outcome, ...(o.misconception ? { misconception: o.misconception } : {}) })
            }}
            className={`min-h-[60px] rounded-2xl px-4 text-left text-xl font-bold ring-2 ${
              picked === o.id ? (o.outcome === 'correct' ? 'bg-leaf-soft ring-leaf' : 'bg-clay-soft ring-clay') : 'bg-white ring-line'
            }`}
            lang={lang}
          >
            {o.label}
          </button>
        ))}
      </div>
      {opt && (
        <div className={`mt-3 rounded-xl p-3 ${opt.outcome === 'correct' ? 'bg-leaf-soft' : 'bg-clay-soft'}`} data-testid="practice-feedback" data-outcome={opt.outcome}>
          <p className="text-lg font-bold">{opt.outcome === 'correct' ? `🎉 ${tc('cv.s.right')}` : `💡 ${tc('cv.s.notRight')}`}</p>
          <p className="mt-1 text-base leading-relaxed" lang={lang}>
            {q.feedback[opt.id]}
          </p>
          <SpeakControls className="mt-2" text={q.feedback[opt.id]} lang={lang} compact label={tc('cv.s.sayToHer')} />
          {opt.outcome !== 'correct' && (
            <button data-testid="practice-retry" onClick={() => setPicked(null)} className="mt-2 min-h-[48px] rounded-full bg-white px-4 text-base font-bold text-brand ring-1 ring-brand/40">
              🔁 {tc('cv.s.tryAgain')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ActionStep({ p, s, plan, lang, sessionId }: { p: LearnerProfile; s: CoachSummary; plan: Plan; lang: Lang; sessionId: string }) {
  const { tc, agreeChallenge } = useApp()
  const c = s.challenge
  const [other, setOther] = useState(false)
  const view = s.sessions.find((x) => x.sessionId === sessionId)!
  const agreedNow = view.recorded.assigned
  const suggested = c.next?.challengeId ?? null
  const followUpOf = c.last && c.last.status !== 'assigned' ? c.last.recordId : undefined
  const concept = plan.topic === 'start' ? null : plan.topic
  const alternatives = CHALLENGES.filter((x) => x.status === 'approved' && x.id !== suggested).sort((a, b) => Number(b.concept === concept) - Number(a.concept === concept))
  const card = (id: string, primary: boolean) => {
    const text = challengeWording(id, lang, p.business)
    return (
      <div key={id} className={`rounded-xl p-3 ${primary ? 'bg-brand-soft' : 'bg-paper ring-1 ring-line'}`} data-testid={`action-card-${id}`}>
        <p className="text-base leading-relaxed" lang={lang}>
          {text}
        </p>
        <SpeakControls className="mt-1" text={text} lang={lang} compact label={tc('cv.s.sayToHer')} />
        <button
          data-testid={`action-agree-${id}`}
          onClick={() => agreeChallenge(p.learnerId, id, followUpOf)}
          className="mt-2 min-h-[52px] rounded-full bg-brand px-5 text-base font-bold text-white"
        >
          🚩 {tc('cv.s.agree')}
        </button>
      </div>
    )
  }
  return (
    <div data-testid="step-action">
      <StepTitle icon="🚩">{tc('cv.s.actionTitle')}</StepTitle>
      {agreedNow ? (
        <div className="rounded-xl bg-leaf-soft p-3" data-testid="action-agreed" data-challenge={agreedNow}>
          <p className="text-base leading-relaxed" lang={lang}>
            {challengeWording(agreedNow, lang, p.business)}
          </p>
          <p className="mt-1 text-sm font-bold text-leaf">✓ {tc('cv.s.agreed')}</p>
        </div>
      ) : c.next?.agreed ? (
        <div className="rounded-xl bg-leaf-soft p-3" data-testid="action-agreed" data-challenge={c.next.challengeId}>
          <p className="text-base leading-relaxed" lang={lang}>
            {challengeWording(c.next.challengeId, lang, p.business)}
          </p>
          <p className="mt-1 text-sm font-bold text-leaf">✓ {tc('cv.ch.agreed')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {suggested && card(suggested, true)}
          <button data-testid="action-other" onClick={() => setOther(!other)} className="min-h-[44px] text-base font-semibold text-brand underline">
            {tc('cv.s.other')}
          </button>
          {other && <div className="space-y-2">{alternatives.slice(0, 4).map((x) => card(x.id, false))}</div>}
        </div>
      )}
      <div className="mt-4 border-t border-line pt-3">
        <div className="mb-2 text-base font-bold">📝 {tc('cv.s.observation')}</div>
        <NoteForm learnerId={p.learnerId} sessionId={sessionId} testid="session-note" />
      </div>
    </div>
  )
}

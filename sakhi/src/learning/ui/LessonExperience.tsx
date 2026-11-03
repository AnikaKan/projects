import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Lock, RefreshCw } from 'lucide-react'
import { SpeakControls } from '../../components/speech/SpeakControls'
import { VoiceAnswer } from '../../components/speech/VoiceAnswer'
import { ScreenShell } from '../../components/ScreenShell'
import { Card, PrimaryButton, SecondaryButton } from '../../components/ui'
import { StallIllustration } from '../../components/Illustrations'
import { useApp } from '../../state/AppState'
import { LESSON_CATALOG } from '../../assessment/bank'
import { latestResult, loadRecord, MemoryStore, type KeyValueStore } from '../../assessment/storage'
import { inr } from '../../lib/calc'
import { evaluate, initialState, lastAttempt, misconceptions, replay, transition } from '../machine'
import { exampleBars, hasText, renderFeedback, renderQuestion, text, valuesFor, type BarSegment } from '../render'
import { LESSONS, saveLesson } from '../storage'
import { useLesson } from '../useLesson'
import { lessonSpeech } from '../speech'
import type { LessonContent, LessonEvent, LessonState, QuestionId, StepId } from '../types'
import type { LessonId } from '../../assessment/types'
import { useOnline } from '../../speech/SpeechContext'
import { AiCard } from '../../ai/AiCard'
import { AnswerChoices } from '../../components/AnswerChoices'
import { useAiAssist, type AiAssistState } from '../../ai/useAiAssist'

/** What the toolbar and question steps need for AI explanations. */
interface Assist {
  ai: AiAssistState | null
  anotherWay: () => void
  interpret: (learnerText: string) => void
}

const PROGRESS_STEPS: StepId[] = ['intro', 'example', 'response', 'feedback', 'practice', 'check', 'challenge']

/** Route entry: /lessons/:id where id is a module (m1) or lesson id. */
export function LessonRoute({ store }: { store?: KeyValueStore }) {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const { t } = useApp()
  const navigate = useNavigate()
  const entry = LESSON_CATALOG.find((l) => l.moduleId === id || l.id === id)
  const content = entry ? LESSONS[entry.id] : undefined
  const demo = params.get('demo')

  // Only module 1 has lesson content. Other modules are recommended honestly and taught with the coach;
  // the app says so instead of showing an empty or fake lesson.
  if (!entry || !content)
    return (
      <ScreenShell
        back="/journey"
        title={entry ? t(`${entry.moduleId}.title`) : undefined}
        footer={
          <div className="space-y-3">
            <PrimaryButton data-testid="not-ready-practice" onClick={() => navigate('/practice/m1')}>
              {t('lesson.notReady.practice')}
            </PrimaryButton>
            <SecondaryButton className="w-full" onClick={() => navigate('/home')}>
              {t('lesson.notReady.home')}
            </SecondaryButton>
          </div>
        }
      >
        <Card className="mt-4 text-center" data-testid="module-not-ready" data-module={entry?.moduleId ?? id}>
          <Lock className="mx-auto text-muted" size={32} aria-hidden />
          <p className="mt-2 text-xl font-bold leading-snug">{t('lesson.notReady.title')}</p>
          <p className="mt-2 text-base leading-relaxed text-muted">{t('lesson.notReady.body')}</p>
          <SpeakControls className="mt-3 justify-center" text={`${t('lesson.notReady.title')}. ${t('lesson.notReady.body')}`} />
        </Card>
      </ScreenShell>
    )
  return <LessonExperience key={`${content.id}-${demo ?? ''}`} content={content} store={store} demo={demo} />
}

/** Scripted events used by the presentation gallery (?demo=…) — always replayed through the real machine. */
const DEMO_SCRIPTS: Record<string, LessonEvent[]> = {
  example: [{ type: 'NEXT' }, { type: 'NEXT' }],
  response: [{ type: 'NEXT' }, { type: 'NEXT' }, { type: 'NEXT' }],
  corrective: [{ type: 'NEXT' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'ANSWER', optionId: 'sales' }],
  practice: [{ type: 'NEXT' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'ANSWER', optionId: 'left' }, { type: 'NEXT' }],
  challenge: [
    { type: 'NEXT' }, { type: 'NEXT' }, { type: 'NEXT' }, { type: 'ANSWER', optionId: 'left' }, { type: 'NEXT' },
    { type: 'ANSWER', optionId: 'profit' }, { type: 'NEXT' }, { type: 'ANSWER', optionId: 'down' }, { type: 'NEXT' },
  ],
}

function LessonExperience({ content, store: injected, demo }: { content: LessonContent; store?: KeyValueStore; demo: string | null }) {
  const app = useApp()
  const { lang, business, learnerId } = app
  const navigate = useNavigate()

  const store = useMemo<KeyValueStore>(() => {
    if (!demo) return injected ?? app.store
    // Demo frames never touch the learner's real progress.
    const mem = new MemoryStore()
    const init = initialState({ content, business, now: 'demo', fromAssessment: ['misconception_revenue_vs_profit'] })
    if (DEMO_SCRIPTS[demo]) saveLesson(mem, learnerId, replay(init, DEMO_SCRIPTS[demo], content))
    return mem
  }, [demo, injected, content, business, learnerId])

  const fromAssessment = useMemo(() => {
    const r = latestResult(loadRecord(injected ?? app.store, learnerId))
    return (r?.answers ?? []).flatMap((a) => (a.outcome.kind === 'misconception' && a.concept === content.id ? [a.outcome.code] : []))
  }, [injected, learnerId, content.id])

  const { state, dispatch: rawDispatch, restart, needsResumeChoice, resume } = useLesson({ learnerId, content, business, fromAssessment, store, skipResumeChoice: !!demo })
  const T = content.text[lang]
  const tx = (key: string, vars?: Record<string, number>) => text(content, lang, business, key, vars)
  const online = useOnline()
  const { ai, request } = useAiAssist(content, state, lang, app.offline || !online)

  // "Explain another way": the machine swaps in the next APPROVED variant where one exists (deterministic),
  // and Claude is asked for a personalised explanation. If Claude is unavailable, the approved variant is what the learner sees.
  const assist: Assist = {
    ai,
    anotherWay: () => {
      const visible =
        state.step === 'intro' || state.step === 'example' || (state.step === 'feedback' && lastAttempt(state, 'response')?.outcome.kind !== 'correct')
      const ev: LessonEvent = { type: 'EXPLAIN_ANOTHER_WAY' }
      const next = visible ? transition(state, ev, { content, now: new Date().toISOString() }) : state
      if (next !== state) dispatch(ev)
      request('explain', { state: next, machineChanged: next !== state })
    },
    interpret: (learnerText) => request('interpret', { learnerText }),
  }

  // Every transition is mirrored into the learner's progress log (answers, starts, completion). Demo frames never write progress.
  const dispatch = (e: LessonEvent) => {
    const next = transition(state, e, { content, now: new Date().toISOString() })
    rawDispatch(e)
    if (demo || next === state) return
    app.recordLessonTransition(content, state, next)
    if (next.step === 'complete' && state.step !== 'complete') {
      if (next.challengeAccepted) app.assignLessonChallenge(content.id as LessonId)
      else app.declineLessonChallenge(content.id as LessonId)
    }
  }
  const finish = dispatch

  if (needsResumeChoice)
    return (
      <ScreenShell
        back="/journey"
        title={T.title}
        footer={
          <div className="space-y-3">
            <PrimaryButton onClick={resume}>{T.ui.resume}</PrimaryButton>
            <SecondaryButton className="w-full" onClick={restart}>
              {T.ui.restart}
            </SecondaryButton>
          </div>
        }
      >
        <div className="overflow-hidden rounded-2xl bg-[#FFF8EE]">
          <StallIllustration business={business} />
        </div>
        <h2 className="mt-5 text-[26px] font-bold leading-snug">{T.ui.resumeTitle}</h2>
        <p className="mt-2 text-lg leading-relaxed text-muted" data-testid="resume-body">
          {T.ui.resumeBody.replace('{step}', T.stepLabels[state.step])}
        </p>
      </ScreenShell>
    )

  const pIdx = PROGRESS_STEPS.indexOf(state.step)
  const step = pIdx >= 0 ? { n: pIdx + 1, total: PROGRESS_STEPS.length, label: `${T.ui.stepOf.replace('{n}', String(pIdx + 1)).replace('{total}', String(PROGRESS_STEPS.length))} · ${T.stepLabels[state.step]}` } : undefined

  return (
    <div className="h-full" data-testid="lesson" data-step={state.step}>
      {state.step === 'assessment_result' && (
        <ScreenShell back="/journey" title={T.title} footer={<PrimaryButton onClick={() => dispatch({ type: 'NEXT' })}>{T.ui.continue}</PrimaryButton>}>
          <div className="overflow-hidden rounded-2xl bg-[#FFF8EE]">
            <StallIllustration business={business} />
          </div>
          <h2 className="mt-5 text-[26px] font-bold leading-snug">{T.stepLabels.assessment_result}</h2>
          <Toolbar assist={assist} content={content} state={state} dispatch={dispatch} speak={lessonSpeech.result(content, lang, business, state.fromAssessment.includes('misconception_revenue_vs_profit'))} />
          <p className="mt-3 text-lg leading-relaxed" data-testid="result-message">
            {tx(state.fromAssessment.includes('misconception_revenue_vs_profit') ? 'result.misconception' : 'result.generic')}
          </p>
        </ScreenShell>
      )}

      {state.step === 'intro' && (
        <ScreenShell back="/journey" title={T.title} step={step} footer={<PrimaryButton onClick={() => dispatch({ type: 'NEXT' })}>{T.ui.continue}</PrimaryButton>}>
          <h2 className="text-[26px] font-bold leading-snug">{tx('h.intro')}</h2>
          <Toolbar assist={assist} content={content} state={state} dispatch={dispatch} speak={lessonSpeech.intro(content, lang, business, state.variant.intro ?? 0)} />
          <p className="mt-3 text-lg leading-relaxed" data-testid="explanation">
            {tx(`intro.${state.variant.intro ?? 0}`)}
          </p>
          <Equation salesLabel={tx('bar.sales')} costsLabel={tx('bar.costs')} profitLabel={tx('bar.profit')} />
        </ScreenShell>
      )}

      {state.step === 'example' && (
        <ScreenShell back="/journey" title={T.title} step={step} footer={<PrimaryButton onClick={() => dispatch({ type: 'NEXT' })}>{T.ui.continue}</PrimaryButton>}>
          <h2 className="text-[26px] font-bold leading-snug">{tx('h.example')}</h2>
          <Toolbar
            assist={assist}
            content={content}
            state={state}
            dispatch={dispatch}
            speak={lessonSpeech.example(content, lang, business, state.variant.example ?? 0)}
          />
          <p className="mt-3 text-lg leading-relaxed" data-testid="explanation">
            {tx(`example.${state.variant.example ?? 0}`, valuesFor(content, business, 'example'))}
          </p>
          <ExampleBars content={content} />
          <h3 className="mt-6 text-lg font-bold">{tx('h.more')}</h3>
          <p className="mt-1 text-lg leading-relaxed">{tx('example.more', valuesFor(content, business, 'example'))}</p>
          <ExampleBars content={content} second />
          {hasText(content, lang, business, 'example.note') && (
            <p className="mt-4 rounded-2xl bg-marigold-soft p-3 text-base leading-relaxed">{tx('example.note', valuesFor(content, business, 'example'))}</p>
          )}
        </ScreenShell>
      )}

      {(state.step === 'response' || state.step === 'feedback' || state.step === 'practice' || state.step === 'check') && (
        <QuestionStep key={state.step === 'feedback' ? 'response' : state.step} assist={assist} content={content} state={state} step={step} dispatch={dispatch} />
      )}

      {state.step === 'challenge' && (
        <ScreenShell
          back="/journey"
          title={T.title}
          step={step}
          footer={
            <div className="space-y-3">
              <PrimaryButton onClick={() => finish({ type: 'ACCEPT_CHALLENGE' })}>{T.ui.accept}</PrimaryButton>
              <SecondaryButton className="w-full" onClick={() => finish({ type: 'NOT_NOW' })}>
                {T.ui.notNow}
              </SecondaryButton>
            </div>
          }
        >
          <Card className="overflow-hidden border-t-4 border-marigold p-0">
            <div className="flex justify-center bg-[#FFF8EE]">
              <div className="w-3/5 max-w-[220px]">
                <StallIllustration business={business} />
              </div>
            </div>
            <div className="p-4">
              <div className="text-sm font-semibold uppercase tracking-wide text-[#8A5A12]">{tx('challenge.title')}</div>
              <p className="mt-2 text-lg font-semibold leading-relaxed" data-testid="challenge-text">
                {tx('challenge')}
              </p>
              <Toolbar assist={assist} content={content} state={state} dispatch={dispatch} speak={lessonSpeech.challenge(content, lang, business)} />
            </div>
          </Card>
        </ScreenShell>
      )}

      {state.step === 'complete' && (
        <ScreenShell
          title={T.title}
          footer={
            <div className="space-y-3">
              <PrimaryButton onClick={() => navigate('/home')}>{T.ui.home}</PrimaryButton>
              <SecondaryButton className="w-full" onClick={restart}>
                {T.ui.again}
              </SecondaryButton>
            </div>
          }
        >
          <Completion content={content} state={state} />
        </ScreenShell>
      )}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function Toolbar({ assist, content, state, dispatch, speak, hideSpeak }: { assist: Assist; content: LessonContent; state: LessonState; dispatch: (e: LessonEvent) => void; speak: string; hideSpeak?: boolean }) {
  const { lang } = useApp()
  const T = content.text[lang]
  // No "another way" needed after a correct answer to the first question.
  const positiveFeedback = state.step === 'feedback' && lastAttempt(state, 'response')?.outcome.kind === 'correct'
  return (
    <>
    <div className="mt-3 flex flex-wrap gap-2">
      {!hideSpeak && <SpeakControls text={speak} label={T.ui.repeat} onPlay={() => dispatch({ type: 'REPEAT' })} />}
      {state.step !== 'complete' && !positiveFeedback && (
        <button
          data-testid="another-way"
          disabled={!!assist.ai?.loading}
          onClick={assist.anotherWay}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-white px-4 py-2 text-base font-semibold text-brand ring-1 ring-brand/40"
        >
          <RefreshCw size={18} aria-hidden />
          {T.ui.another}
        </button>
      )}
    </div>
    {assist.ai?.mode === 'explain' && <AiCard ai={assist.ai} content={content} state={state} dispatch={dispatch} />}
    </>
  )
}

function Equation({ salesLabel, costsLabel, profitLabel }: { salesLabel: string; costsLabel: string; profitLabel: string }) {
  const chip = 'flex items-center gap-1.5 rounded-xl px-3 py-2'
  return (
    <div className="mt-5 flex flex-wrap items-center gap-2 text-lg font-bold" aria-hidden data-testid="lesson-equation">
      <span className={`${chip} bg-brand-soft text-brand`}><span>🧺</span>{salesLabel}</span>
      <span>−</span>
      <span className={`${chip} bg-[#EDE6DC]`}><span>📦</span>{costsLabel}</span>
      <span>=</span>
      <span className={`${chip} bg-leaf-soft text-leaf`}><span>💰</span>{profitLabel}</span>
    </div>
  )
}

const SEG_CLASS: Record<BarSegment['kind'], string> = { goods: 'bg-[#6B5B4E]', other: 'bg-clay', left: 'bg-marigold', profit: 'bg-leaf' }

function ExampleBars({ content, second }: { content: LessonContent; second?: boolean }) {
  const { lang, business } = useApp()
  const bars = exampleBars(content, business, lang)
  const segs = second ? bars.second : bars.first
  return (
    <Card className="mt-4" >
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold text-muted">{text(content, lang, business, 'bar.sales')}</span>
        <span className="text-2xl font-bold tabular-nums">{inr(bars.sales)}</span>
      </div>
      <div className="flex h-10 w-full overflow-hidden rounded-xl ring-1 ring-line" role="img" aria-label={segs.map((s) => `${s.label} ${inr(s.amount)}`).join(', ')}>
        {segs.map((s) => (
          <div key={s.key} className={`${SEG_CLASS[s.kind]} h-full`} style={{ width: `${(s.amount / bars.sales) * 100}%`, minWidth: 8 }} />
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-3 text-base">
            <span className={`h-5 w-5 shrink-0 rounded ${SEG_CLASS[s.kind]}`} aria-hidden />
            <span className="flex-1 leading-snug">{s.label}</span>
            <span className={`font-bold tabular-nums ${s.kind === 'profit' || s.kind === 'left' ? 'text-leaf' : ''}`} data-testid={`seg-${s.key}`}>
              {inr(s.amount)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function QuestionStep({
  assist,
  content,
  state,
  step,
  dispatch,
}: {
  assist: Assist
  content: LessonContent
  state: LessonState
  step?: { n: number; total: number; label: string }
  dispatch: (e: LessonEvent) => void
}) {
  const { lang, business } = useApp()
  const T = content.text[lang]
  const q: QuestionId = state.step === 'feedback' || state.step === 'response' ? 'response' : (state.step as QuestionId)
  const rq = renderQuestion(content, q, business, lang)
  const fb = renderFeedback(content, state, q, lang)
  const [pending, setPending] = useState<string | null>(null)
  const last = lastAttempt(state, q)
  const locked = !!fb
  const correctId = content.questions[q].options.find((o) => o.outcome.kind === 'correct')!.id
  const showCorrect = locked && (fb!.tone === 'positive' || !fb!.canRetry)
  const heading = q === 'practice' ? 'h.practice' : q === 'check' ? 'h.check' : null

  let footer
  if (!fb)
    footer = (
      <PrimaryButton
        disabled={!pending}
        onClick={() => {
          dispatch({ type: 'ANSWER', optionId: pending! })
          setPending(null)
        }}
      >
        {T.ui.check}
      </PrimaryButton>
    )
  else if (fb.canRetry)
    footer = (
      <div className="space-y-3">
        <PrimaryButton onClick={() => dispatch({ type: 'RETRY' })}>{T.ui.tryAgain}</PrimaryButton>
        <SecondaryButton className="w-full" onClick={() => dispatch({ type: 'NEXT' })}>
          {T.ui.continue}
        </SecondaryButton>
      </div>
    )
  else footer = <PrimaryButton onClick={() => dispatch({ type: 'NEXT' })}>{T.ui.continue}</PrimaryButton>

  return (
    <ScreenShell back="/journey" title={T.title} step={step} footer={footer}>
      {heading && <h2 className="mb-2 text-lg font-bold text-muted">{text(content, lang, business, heading)}</h2>}
      <p className="text-xl font-semibold leading-relaxed" data-testid="stem">
        {rq.stem}
      </p>
      <AnswerChoices
        question={rq.stem}
        choices={rq.options}
        readKey={`${q}-${state.questions[q].attempts.length}`}
        locked={locked}
        selectedId={locked ? last?.optionId : pending}
        toneFor={(id) => (showCorrect && id === correctId ? 'right' : undefined)}
        onSelect={setPending}
        onListen={() => dispatch({ type: 'REPEAT' })}
        voice={
          <>
            <VoiceAnswer options={rq.options} questionText={rq.stem} onConfirm={(id) => setPending(id)} onUnmatched={assist.interpret} />
            {assist.ai?.mode === 'interpret' && <AiCard ai={assist.ai} content={content} state={state} dispatch={dispatch} />}
          </>
        }
        feedback={
          fb ? (
            <>
              <Card className={`mt-4 ${fb.tone === 'positive' ? 'bg-leaf-soft' : 'bg-marigold-soft'}`}>
                <div className="flex items-start gap-3" data-testid="feedback" data-tone={fb.tone}>
                  <span className="text-2xl" aria-hidden>{fb.tone === 'positive' ? '🎉' : '💡'}</span>
                  <div>
                    <p className="text-lg font-semibold leading-relaxed">{fb.message}</p>
                    {fb.closing && <p className="mt-2 text-base leading-relaxed text-muted">{fb.closing}</p>}
                  </div>
                </div>
              </Card>
              <Toolbar assist={assist} content={content} state={state} dispatch={dispatch} speak={lessonSpeech.feedback(fb)} />
            </>
          ) : null
        }
      />
      {!fb && <Toolbar assist={assist} content={content} state={state} dispatch={dispatch} speak="" hideSpeak />}
    </ScreenShell>
  )
}

function Completion({ content, state }: { content: LessonContent; state: LessonState }) {
  const { lang, business, t } = useApp()
  const tx = (k: string) => text(content, lang, business, k)
  const result = state.result ?? evaluate(state)
  const summary = misconceptions(state)
  return (
    <div data-testid="completion" data-result={result} data-open={summary.open.join(',')} data-resolved={summary.resolved.join(',')}>
      <div className="mt-2 flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-leaf text-white">
          <CheckCircle2 size={26} aria-hidden />
        </span>
        <h2 className="text-[26px] font-bold leading-snug">{tx('complete.title')}</h2>
      </div>
      <p className="mt-3 text-lg leading-relaxed">{tx(`complete.${result}`)}</p>
      <SpeakControls className="mt-3" text={lessonSpeech.complete(content, lang, business, result)} />
      <Card className="mt-4 bg-brand-soft">
        <p className="text-lg font-bold leading-relaxed text-brand">{tx('complete.rule')}</p>
      </Card>
      <p className="mt-4 text-base leading-relaxed text-muted">{state.challengeAccepted ? tx('complete.accepted') : tx('complete.later')}</p>
      {state.challengeAccepted && <p className="mt-1 text-base leading-relaxed">{tx('challenge')}</p>}
      <Link to="/progress" className="mt-4 inline-block min-h-[48px] py-3 text-base font-semibold text-brand underline underline-offset-4">
        {t('nav.progress')}
      </Link>
    </div>
  )
}

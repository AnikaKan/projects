import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Lightbulb } from 'lucide-react'
import { ScreenShell } from '../../components/ScreenShell'
import { AudioButton, Card, PrimaryButton, SecondaryButton } from '../../components/ui'
import { StallIllustration } from '../../components/Illustrations'
import { useApp } from '../../state/AppState'
import { LESSON_CATALOG } from '../bank'
import { currentItemId, MAX_QUESTIONS, renderQuestion, scoreAnswer } from '../engine'
import { at } from '../i18n'
import { useAssessment } from '../useAssessment'
import { VoiceAnswer } from '../../components/speech/VoiceAnswer'
import { AnswerChoices } from '../../components/AnswerChoices'
import type { KeyValueStore } from '../storage'
import type { AnswerSource, RenderedQuestion, ScoredAnswer } from '../types'


export function AssessmentFlow({ store }: { store?: KeyValueStore }) {
  const app = useApp()
  const { lang, business, learnerId, t } = app
  const a = useAssessment(learnerId, store)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [phase, setPhase] = useState<'intro' | 'question' | 'unlock'>('intro')
  const [pending, setPending] = useState<{ optionId: string; source: AnswerSource } | null>(null)
  const [feedback, setFeedback] = useState<{ scored: ScoredAnswer; done: boolean; unlocked: number } | null>(null)
  const demoStarted = useRef(false)

  const s = a.inProgress && a.inProgress.business === business ? a.inProgress : null
  const answered = s?.answers.length ?? 0
  const itemId = s ? (feedback ? feedback.scored.itemId : currentItemId(s)) : null
  const q = useMemo(() => (itemId ? renderQuestion(itemId, business, lang) : null), [itemId, business, lang])

  // Gallery deep link: ?demo=question opens straight on the first question.
  useEffect(() => {
    if (params.get('demo') === 'question' && !demoStarted.current) {
      demoStarted.current = true
      if (!s || s.answers.length) a.start(business)
      setPhase('question')
    }
  }, [params, s, a, business])

  const A = (key: string, vars?: Record<string, string | number>) => at(lang, key, vars)

  if (phase === 'intro' || !s || !q) {
    const canResume = !!s && answered > 0
    return (
      <ScreenShell
        back="/onboarding/business"
        footer={
          canResume ? (
            <div className="space-y-3">
              <PrimaryButton onClick={() => setPhase('question')}>{A('a.resume')}</PrimaryButton>
              <SecondaryButton
                className="w-full"
                onClick={() => {
                  a.start(business)
                  setFeedback(null)
                  setPending(null)
                  setPhase('question')
                }}
              >
                {A('a.startOver')}
              </SecondaryButton>
            </div>
          ) : (
            <PrimaryButton
              onClick={() => {
                if (!s) a.start(business)
                setPhase('question')
              }}
            >
              {A('a.start')}
            </PrimaryButton>
          )
        }
      >
        <div className="overflow-hidden rounded-3xl bg-[#FFF8EE]">
          <StallIllustration business={business} />
        </div>
        <h2 className="mt-5 text-[26px] font-bold leading-snug">{canResume ? A('a.resumeTitle') : A('a.introTitle')}</h2>
        <p className="mt-2 text-lg leading-relaxed text-muted">
          {canResume ? A('a.resumeBody', { done: answered, total: s!.itemIds.length }) : A('a.introBody', { n: s?.itemIds.length ?? MAX_QUESTIONS })}
        </p>
        <AudioButton
          className="mt-4"
          text={`${canResume ? A('a.resumeTitle') : A('a.introTitle')}. ${canResume ? A('a.resumeBody', { done: answered, total: s!.itemIds.length }) : A('a.introBody', { n: s?.itemIds.length ?? MAX_QUESTIONS })}`}
        />
      </ScreenShell>
    )
  }

  if (phase === 'unlock')
    return (
      <ScreenShell footer={<PrimaryButton data-testid="unlock-continue" onClick={() => setPhase('question')}>{A('a.next')}</PrimaryButton>}>
        <div className="mt-6 text-center" data-testid="tier-unlocked" data-more={s.itemIds.length - answered}>
          <div className="text-6xl" aria-hidden>
            ⭐
          </div>
          <h2 className="mt-3 text-[28px] font-bold leading-snug">{A('a.unlockTitle')}</h2>
          <p className="mt-2 text-xl leading-relaxed">{A('a.unlockBody', { n: s.itemIds.length - answered })}</p>
          <AudioButton className="mt-4 justify-center" text={`${A('a.unlockTitle')} ${A('a.unlockBody', { n: s.itemIds.length - answered })}`} />
        </div>
      </ScreenShell>
    )

  const total = s.itemIds.length
  const n = feedback ? answered : answered + 1
  const locked = !!feedback

  const confirm = () => {
    if (!pending) return
    const { scored, nextAction, unlocked } = a.answer({
      itemId: q.itemId,
      optionId: pending.optionId,
      source: pending.source,
      lang,
    })
    setFeedback({ scored, done: nextAction === 'complete_assessment', unlocked })
    setPending(null)
  }

  const next = () => {
    if (feedback?.done) {
      const result = a.complete(app.completed.map((m) => LESSON_CATALOG.find((l) => l.moduleId === m)!.id))
      app.recordAssessment(result)
      navigate('/assessment/result')
      return
    }
    // Foundational round passed: say so, then continue with the (few) harder questions.
    if (feedback?.unlocked) setPhase('unlock')
    setFeedback(null)
  }

  return (
    <ScreenShell
      step={{ n, total, label: t('questionOf', { n, total }) }}
      footer={
        feedback ? (
          <PrimaryButton onClick={next}>{feedback.done ? A('a.seeResult') : A('a.next')}</PrimaryButton>
        ) : (
          <PrimaryButton disabled={!pending} onClick={confirm}>
            {A('a.confirm')}
          </PrimaryButton>
        )
      }
    >
      <p className="text-xl font-semibold leading-relaxed" data-testid="stem">
        {q.stem}
      </p>
      <AnswerChoices
        question={q.stem}
        choices={q.options}
        readKey={q.itemId}
        locked={locked}
        selectedId={locked ? feedback!.scored.optionId : pending?.optionId}
        // Shown in green after answering; the learner's own choice is never marked red.
        toneFor={(id) => (locked && correctOptionId(q) === id ? 'right' : undefined)}
        onSelect={(optionId) => setPending({ optionId, source: 'tap' })}
        voice={<VoiceAnswer options={q.options} questionText={q.stem} onConfirm={(optionId) => setPending({ optionId, source: 'voice' })} />}
        feedback={feedback ? <Feedback q={q} scored={feedback.scored} /> : null}
      />
    </ScreenShell>
  )
}

function correctOptionId(q: RenderedQuestion): string | undefined {
  return q.options.find((o) => scoreAnswer(q.itemId, o.id).outcome.kind === 'correct')?.id
}

function Feedback({ q, scored }: { q: RenderedQuestion; scored: ScoredAnswer }) {
  const { lang } = useApp()
  const kind = scored.outcome.kind
  const head = kind === 'correct' ? at(lang, 'fb.correct') : kind === 'unsure' ? at(lang, 'fb.unsure') : at(lang, 'fb.misconception')
  return (
    <Card className={`mt-4 ${kind === 'correct' ? 'bg-leaf-soft' : 'bg-marigold-soft'}`}>
      <div data-testid="feedback" data-outcome={kind} className="flex items-start gap-2">
        {kind === 'correct' ? <CheckCircle2 className="mt-1 shrink-0 text-leaf" size={24} aria-hidden /> : <Lightbulb className="mt-1 shrink-0 text-[#8A5A12]" size={24} aria-hidden />}
        <div>
          <p className="text-lg font-bold leading-snug">{head}</p>
          <p className="mt-1 text-base leading-relaxed">{q.explanation}</p>
          {kind === 'misconception' && <p className="mt-1 text-base leading-relaxed text-muted">{at(lang, 'fb.together')}</p>}
        </div>
      </div>
      <AudioButton className="mt-3" text={[head, q.explanation, kind === 'misconception' ? at(lang, 'fb.together') : ''].filter(Boolean).join(' ')} />
    </Card>
  )
}

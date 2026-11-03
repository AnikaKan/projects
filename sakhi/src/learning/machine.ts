// Typed, pure lesson state machine.
//
//  assessment_result → intro → example → response ─ANSWER→ feedback ─NEXT→ practice → check → challenge → complete
//                                          ↑            │RETRY (wrong, attempts left)
//                                          └────────────┘
//  practice / check: ANSWER shows feedback in place; practice allows RETRY; check is answered once.
//  REPEAT and EXPLAIN_ANOTHER_WAY are available on every step before completion.
//  Invalid events return the same state object (no-op), so the UI can never reach an undefined state.

import type { MisconceptionCode } from '../assessment/types'
import type { Business } from '../lib/calc'
import { STEPS, type LessonContent, type LessonEvent, type LessonResult, type LessonState, type MisconceptionSummary, type QuestionId, type StepId } from './types'

export function initialState(opts: { content: LessonContent; business: Business; now: string; fromAssessment?: MisconceptionCode[] }): LessonState {
  const q = () => ({ attempts: [], phase: 'asking' as const })
  return {
    schemaVersion: 1,
    lessonId: opts.content.id,
    business: opts.business,
    step: 'assessment_result',
    questions: { response: q(), practice: q(), check: q() },
    variant: {},
    repeats: 0,
    anotherWay: 0,
    fromAssessment: opts.fromAssessment ?? [],
    challengeAccepted: null,
    startedAt: opts.now,
    updatedAt: opts.now,
    completedAt: null,
    result: null,
  }
}

const NEXT_STEP: Partial<Record<StepId, StepId>> = {
  assessment_result: 'intro',
  intro: 'example',
  example: 'response',
  feedback: 'practice',
  practice: 'check',
  check: 'challenge',
}

/** Which question a step asks, if any. Feedback belongs to the response question. */
export function questionForStep(step: StepId): QuestionId | null {
  if (step === 'response' || step === 'feedback') return 'response'
  if (step === 'practice') return 'practice'
  if (step === 'check') return 'check'
  return null
}

export function lastAttempt(s: LessonState, q: QuestionId) {
  const a = s.questions[q].attempts
  return a.length ? a[a.length - 1] : null
}

/** Can the learner try this question again from its current feedback? */
export function canRetry(s: LessonState, content: LessonContent, q: QuestionId): boolean {
  const qs = s.questions[q]
  const last = lastAttempt(s, q)
  return qs.phase === 'feedback' && !!last && last.outcome.kind !== 'correct' && qs.attempts.length < content.questions[q].maxAttempts
}

/** Can the learner move forward from the current step? */
export function canAdvance(s: LessonState): boolean {
  if (s.step === 'response' || s.step === 'challenge' || s.step === 'complete') return false
  const q = s.step === 'practice' || s.step === 'check' ? s.step : null
  return q ? s.questions[q].phase === 'feedback' : true
}

export function transition(s: LessonState, e: LessonEvent, ctx: { content: LessonContent; now: string }): LessonState {
  if (s.step === 'complete') return s
  const touch = (patch: Partial<LessonState>): LessonState => ({ ...s, ...patch, updatedAt: ctx.now })

  switch (e.type) {
    case 'REPEAT':
      return touch({ repeats: s.repeats + 1 })

    case 'EXPLAIN_ANOTHER_WAY': {
      const n = ctx.content.explainVariants[s.step] ?? 0
      if (n < 2) return s
      return touch({ anotherWay: s.anotherWay + 1, variant: { ...s.variant, [s.step]: ((s.variant[s.step] ?? 0) + 1) % n } })
    }

    case 'NEXT': {
      if (!canAdvance(s)) return s
      const to = NEXT_STEP[s.step]
      return to ? touch({ step: to }) : s
    }

    case 'ANSWER': {
      const q = s.step === 'response' ? 'response' : s.step === 'practice' || s.step === 'check' ? s.step : null
      if (!q || s.questions[q].phase !== 'asking') return s
      const spec = ctx.content.questions[q]
      const opt = spec.options.find((o) => o.id === e.optionId)
      if (!opt) return s
      if (s.questions[q].attempts.length >= spec.maxAttempts) return s
      const questions = {
        ...s.questions,
        [q]: { attempts: [...s.questions[q].attempts, { optionId: opt.id, outcome: opt.outcome, at: ctx.now }], phase: 'feedback' as const },
      }
      // A new answer always shows its own feedback first (reset any 'explain another way' on feedback).
      return touch({ questions, step: q === 'response' ? 'feedback' : s.step, variant: { ...s.variant, feedback: 0 } })
    }

    case 'RETRY': {
      const q = questionForStep(s.step)
      if (!q || !canRetry(s, ctx.content, q)) return s
      return touch({
        questions: { ...s.questions, [q]: { ...s.questions[q], phase: 'asking' } },
        step: q === 'response' ? 'response' : s.step,
      })
    }

    case 'ACCEPT_CHALLENGE':
    case 'NOT_NOW': {
      if (s.step !== 'challenge') return s
      const done = touch({ step: 'complete', challengeAccepted: e.type === 'ACCEPT_CHALLENGE', completedAt: ctx.now })
      return { ...done, result: evaluate(done) }
    }
  }
}

/**
 * Deterministic evaluation of understanding for this lesson. Never "mastered":
 * - understood: practice right on the first try AND comprehension check right
 * - developing: one of the two right (including practice right on the second try)
 * - needs_review: neither
 */
export function evaluate(s: LessonState): LessonResult {
  const practice = s.questions.practice.attempts
  const check = lastAttempt(s, 'check')
  const checkRight = check?.outcome.kind === 'correct'
  const practiceFirst = practice[0]?.outcome.kind === 'correct'
  const practiceEventually = practice.some((a) => a.outcome.kind === 'correct')
  if (checkRight && practiceFirst) return 'understood'
  if (checkRight || practiceEventually) return 'developing'
  return 'needs_review'
}

/** Misconceptions seen in this lesson (and from the assessment), and whether a later correct answer resolved them. */
export function misconceptions(s: LessonState): MisconceptionSummary {
  const timeline = (['response', 'practice', 'check'] as const).flatMap((q) => s.questions[q].attempts)
  const observed: MisconceptionCode[] = [...s.fromAssessment]
  for (const a of timeline) if (a.outcome.kind === 'misconception' && !observed.includes(a.outcome.code)) observed.push(a.outcome.code)
  const resolved: MisconceptionCode[] = []
  for (const code of observed) {
    const lastMiss = timeline.map((a) => a.outcome.kind === 'misconception' && a.outcome.code === code).lastIndexOf(true)
    const laterCorrect = timeline.slice(lastMiss + 1).some((a) => a.outcome.kind === 'correct')
    if (laterCorrect) resolved.push(code)
  }
  return { observed, resolved, open: observed.filter((c) => !resolved.includes(c)) }
}

export function stepIndex(step: StepId): number {
  return STEPS.indexOf(step)
}

/**
 * Replays a list of events from a fresh state. Used for demo deep links and tests,
 * so every demo screen is a real, reachable machine state.
 */
export function replay(init: LessonState, events: LessonEvent[], content: LessonContent, now = init.startedAt): LessonState {
  return events.reduce((st, ev) => transition(st, ev, { content, now }), init)
}

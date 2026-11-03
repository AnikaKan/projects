// Translates lesson state-machine transitions into progress events. Used by the live lesson UI and by the demo seed,
// so demo learners are produced by exactly the same code path as real use.
import type { LessonId } from '../assessment/types'
import { LESSON_CATALOG } from '../assessment/bank'
import { evaluate, initialState, transition } from '../learning/machine'
import type { LessonContent, LessonEvent, LessonState, QuestionId } from '../learning/types'
import { completeLesson, lessonStarted, recordLessonAnswer } from './engine'
import type { LearnerProfile } from './types'

const QUESTIONS: QuestionId[] = ['response', 'practice', 'check']

/** Progress updates caused by one lesson transition (prev → next). Pure. */
export function applyLessonTransition(p: LearnerProfile, content: LessonContent, prev: LessonState, next: LessonState, now: string): LearnerProfile {
  if (prev === next) return p
  const lessonId = content.id as LessonId
  const concept = LESSON_CATALOG.find((l) => l.id === lessonId)!.concept
  let out = p
  // A run starts when the learner moves past the starting-point screen (first time, after "start again", or a redo).
  if (prev.step === 'assessment_result' && next.step !== 'assessment_result') out = lessonStarted(out, lessonId, now)
  for (const q of QUESTIONS) {
    const a = next.questions[q].attempts
    if (a.length > prev.questions[q].attempts.length) {
      out = recordLessonAnswer(out, { lessonId, concept, question: q, outcome: a[a.length - 1].outcome, attemptNumber: a.length }, now)
    }
  }
  if (prev.step !== 'complete' && next.step === 'complete') out = completeLesson(out, lessonId, next.result ?? evaluate(next), now)
  return out
}

/** Runs a scripted lesson through the real machine, recording progress as it goes (demo seed and tests). */
export function playLesson(
  p: LearnerProfile,
  content: LessonContent,
  events: LessonEvent[],
  now: string,
  opts: { fromAssessment?: LessonState['fromAssessment'] } = {},
): { profile: LearnerProfile; state: LessonState } {
  let state = initialState({ content, business: p.business, now, fromAssessment: opts.fromAssessment })
  let profile = p
  for (const e of events) {
    const next = transition(state, e, { content, now })
    profile = applyLessonTransition(profile, content, state, next, now)
    state = next
  }
  return { profile, state }
}

import { useCallback, useState } from 'react'
import type { KeyValueStore } from '../assessment/storage'
import type { MisconceptionCode } from '../assessment/types'
import type { Business } from '../lib/calc'
import { initialState, transition } from './machine'
import { loadLesson, saveLesson } from './storage'
import type { LessonContent, LessonEvent, LessonState } from './types'

/** React binding: loads/saves lesson progress and forwards events to the pure machine. */
export function useLesson(opts: {
  learnerId: string
  content: LessonContent
  business: Business
  fromAssessment: MisconceptionCode[]
  store: KeyValueStore
  clock?: () => string
  /** Open directly at the saved step (presentation demos). */
  skipResumeChoice?: boolean
}) {
  const { learnerId, content, business, fromAssessment, store } = opts
  const clock = opts.clock ?? (() => new Date().toISOString())

  const [state, setState] = useState<LessonState>(() => {
    const saved = loadLesson(store, learnerId, content.id)
    return saved && saved.business === business ? saved : initialState({ content, business, now: clock(), fromAssessment })
  })
  /** True when a saved, unfinished lesson was found and the learner has not chosen resume/restart yet. */
  const [needsResumeChoice, setNeedsResumeChoice] = useState(() => !opts.skipResumeChoice && state.step !== 'assessment_result' && state.step !== 'complete')

  const dispatch = useCallback(
    (e: LessonEvent) => {
      setState((prev) => {
        const next = transition(prev, e, { content, now: clock() })
        if (next !== prev) saveLesson(store, learnerId, next)
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, store, learnerId],
  )

  const restart = useCallback(() => {
    const s = initialState({ content, business, now: clock(), fromAssessment })
    saveLesson(store, learnerId, s)
    setState(s)
    setNeedsResumeChoice(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, business, fromAssessment, store, learnerId])

  return { state, dispatch, restart, needsResumeChoice, resume: () => setNeedsResumeChoice(false) }
}

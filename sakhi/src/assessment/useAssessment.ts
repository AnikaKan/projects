import { useCallback, useMemo, useState } from 'react'
import type { Business } from '../lib/calc'
import { finalize, isComplete, startAssessment, submitAnswer } from './engine'
import { defaultStore, latestResult, loadRecord, nextAttemptNumber, saveRecord, type KeyValueStore, type LearnerAssessmentRecord } from './storage'
import type { AnswerInput, AssessmentResult, NextAction, ScoredAnswer } from './types'

/** React binding for the engine + local storage. Holds no scoring logic of its own. */
export function useAssessment(learnerId: string, store: KeyValueStore = defaultStore(), clock: () => string = () => new Date().toISOString()) {
  const [kv] = useState(store)
  const [rec, setRec] = useState<LearnerAssessmentRecord>(() => loadRecord(kv, learnerId))

  const commit = useCallback(
    (next: LearnerAssessmentRecord) => {
      saveRecord(kv, learnerId, next)
      setRec(next)
    },
    [kv, learnerId],
  )

  const start = useCallback(
    (business: Business, length?: number) => {
      // Retake: a learner who reached the intermediate tier re-checks with applied questions; otherwise staged again.
      const last = latestResult(rec)
      const mode = last?.tier === 'intermediate' ? 'applied' : 'staged'
      const session = startAssessment({ learnerId, business, attempt: nextAttemptNumber(rec), length, now: clock(), mode })
      commit({ ...rec, inProgress: session })
      return session
    },
    [rec, commit, learnerId, clock],
  )

  const answer = useCallback(
    (input: Omit<AnswerInput, 'answeredAt'>): { scored: ScoredAnswer; nextAction: NextAction; unlocked: number } => {
      if (!rec.inProgress) throw new Error('No assessment in progress')
      const before = rec.inProgress.itemIds.length
      const { session, scored, nextAction } = submitAnswer(rec.inProgress, { ...input, answeredAt: clock() })
      commit({ ...rec, inProgress: session })
      return { scored, nextAction, unlocked: session.itemIds.length - before }
    },
    [rec, commit, clock],
  )

  const complete = useCallback(
    (completedLessons: string[] = []): AssessmentResult => {
      if (!rec.inProgress || !isComplete(rec.inProgress)) throw new Error('Assessment is not complete')
      const result = finalize(rec.inProgress, { now: clock(), previousResults: rec.results, completedLessons })
      commit({ schemaVersion: 1, inProgress: null, results: [...rec.results, result] })
      return result
    },
    [rec, commit, clock],
  )

  const discard = useCallback(() => commit({ ...rec, inProgress: null }), [rec, commit])

  return useMemo(
    () => ({ record: rec, inProgress: rec.inProgress, latest: latestResult(rec), start, answer, complete, discard }),
    [rec, start, answer, complete, discard],
  )
}

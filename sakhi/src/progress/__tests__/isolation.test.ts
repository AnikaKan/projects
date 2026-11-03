// Per-learner data isolation (readiness audit 2026-10-30; an earlier prototype had all Coach View learners
// share one progress record). Every store is keyed by learner id: progress profile, lesson state, assessment.
import { describe, expect, it } from 'vitest'
import { MemoryStore, loadRecord, saveRecord, storageKey } from '../../assessment/storage'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../../assessment/engine'
import { loadLesson, saveLesson, lessonKey } from '../../learning/storage'
import { initialState, transition } from '../../learning/machine'
import { REVENUE_VS_PROFIT } from '../../learning/content/revenueVsProfit'
import { LocalProgressRepository } from '../repository'
import { buildDemoLearners } from '../demo'
import { deriveProgress, recordPracticeAnswer } from '../engine'

const NOW = '2026-10-30T10:00:00.000Z'

describe('per-learner isolation', () => {
  it('a practice answer for one learner changes only that learner’s profile', () => {
    const store = new MemoryStore()
    const repo = new LocalProgressRepository(store)
    for (const p of buildDemoLearners(store, NOW)) repo.save(p)
    const before = repo.list().map((p) => JSON.stringify(p))
    const a = repo.get('DL-01')!
    repo.save(recordPracticeAnswer(a, { concept: 'customer_credit', itemKey: 'iso', outcome: 'misconception', misconception: 'misconception_credit_as_cash', firstTry: true }, NOW))
    const after = repo.list()
    expect(after.length).toBe(before.length)
    after.forEach((p, i) => {
      if (p.learnerId === 'DL-01') expect(JSON.stringify(p)).not.toBe(before[i])
      else expect(JSON.stringify(p)).toBe(before[i])
    })
    expect(deriveProgress(repo.get('DL-01')!).concepts.customer_credit.needsPractice).toBe(true)
    expect(deriveProgress(repo.get('DL-02')!).concepts.customer_credit.needsPractice).toBe(deriveProgress(JSON.parse(before[1])).concepts.customer_credit.needsPractice)
  })

  it('lesson state and assessment records are stored under separate keys per learner', () => {
    const store = new MemoryStore()
    expect(lessonKey('DL-01', 'revenue_vs_profit')).not.toBe(lessonKey('DL-02', 'revenue_vs_profit'))
    expect(storageKey('DL-01')).not.toBe(storageKey('DL-02'))
    const s = transition(initialState({ content: REVENUE_VS_PROFIT, business: 'vegetable', now: 't' }), { type: 'NEXT' }, { content: REVENUE_VS_PROFIT, now: 't' })
    saveLesson(store, 'DL-01', s)
    expect(loadLesson(store, 'DL-01', 'revenue_vs_profit')?.step).toBe(s.step)
    expect(loadLesson(store, 'DL-02', 'revenue_vs_profit')).toBeNull()
    let a = startAssessment({ learnerId: 'DL-01', business: 'vegetable', attempt: 1, now: 't' })
    for (let id = currentItemId(a); id; id = currentItemId(a)) a = submitAnswer(a, { itemId: id, optionId: 'unsure', source: 'tap', lang: 'te', answeredAt: 't' }).session
    saveRecord(store, 'DL-01', { schemaVersion: 1, inProgress: null, results: [finalize(a, { now: 't' })] })
    expect(loadRecord(store, 'DL-01').results).toHaveLength(1)
    expect(loadRecord(store, 'DL-02').results).toHaveLength(0)
  })
})

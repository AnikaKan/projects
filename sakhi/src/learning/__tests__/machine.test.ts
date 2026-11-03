import { describe, expect, it } from 'vitest'
import { REVENUE_VS_PROFIT as C } from '../content/revenueVsProfit'
import { canAdvance, evaluate, initialState, misconceptions, replay, transition } from '../machine'
import { deriveCheckValues, deriveValues } from '../calc'
import { loadLesson, saveLesson, lessonKey } from '../storage'
import { MemoryStore } from '../../assessment/storage'
import { STEPS, type LessonEvent, type LessonState } from '../types'

const NOW = '2026-10-28T10:00:00.000Z'
const ctx = { content: C, now: NOW }
const fresh = (fromAssessment: LessonState['fromAssessment'] = []) => initialState({ content: C, business: 'vegetable', now: NOW, fromAssessment })
const run = (events: LessonEvent[], s = fresh()) => replay(s, events, C, NOW)
const N: LessonEvent = { type: 'NEXT' }
const A = (optionId: string): LessonEvent => ({ type: 'ANSWER', optionId })
const TO_RESPONSE: LessonEvent[] = [N, N, N] // assessment_result → intro → example → response

describe('deterministic calculations', () => {
  it('PRD demo: vegetable ₹500 sales − ₹300 vegetables = ₹200 left; other costs reduce final profit', () => {
    const v = deriveValues(C.scenarios.vegetable.example)
    expect(v.left).toBe(200)
    expect(v.otherTotal).toBe(70)
    expect(v.profit).toBe(130)
    expect(v.profit).toBeLessThan(v.left)
  })

  it('every business: profit = sales − goods − other costs, all positive integers', () => {
    for (const b of ['vegetable', 'tea', 'grocery'] as const)
      for (const k of ['example', 'practice'] as const) {
        const n = C.scenarios[b][k]
        const v = deriveValues(n)
        expect(v.profit).toBe(n.sales - n.goodsCost - Object.values(n.otherCosts).reduce((a, x) => a + x, 0))
        expect(v.profit).toBeGreaterThan(0)
        expect(Number.isInteger(v.profit)).toBe(true)
      }
  })

  it('every business: the check scenario has sales up and profit down (so “No” is unambiguous)', () => {
    for (const b of ['vegetable', 'tea', 'grocery'] as const) {
      const c = deriveCheckValues(C.scenarios[b].checkBefore, C.scenarios[b].checkAfter)
      expect(c.salesAfter).toBeGreaterThan(c.salesBefore)
      expect(c.profitAfter).toBeLessThan(c.profitBefore)
    }
  })

  it('rejects non-integer or negative amounts', () => {
    expect(() => deriveValues({ sales: 10.5, goodsCost: 1, otherCosts: {} })).toThrow(RangeError)
    expect(() => deriveValues({ sales: 10, goodsCost: -1, otherCosts: {} })).toThrow(RangeError)
  })
})

describe('state machine — the nine states in order', () => {
  it('correct pathway visits every state and ends "understood"', () => {
    const seen: string[] = []
    let s = fresh()
    const events: LessonEvent[] = [...TO_RESPONSE, A('left'), N, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }]
    seen.push(s.step)
    for (const e of events) {
      s = transition(s, e, ctx)
      if (seen[seen.length - 1] !== s.step) seen.push(s.step)
    }
    expect(seen).toEqual([...STEPS])
    expect(s.result).toBe('understood')
    expect(s.challengeAccepted).toBe(true)
    expect(s.completedAt).toBe(NOW)
    expect(misconceptions(s)).toEqual({ observed: [], resolved: [], open: [] })
  })

  it('PRD demo pathway: ₹500 = profit → corrective feedback → retry → ₹200 → resolved misconception', () => {
    let s = run([...TO_RESPONSE, A('sales')], fresh(['misconception_revenue_vs_profit']))
    expect(s.step).toBe('feedback')
    expect(s.questions.response.attempts[0].outcome).toEqual({ kind: 'misconception', code: 'misconception_revenue_vs_profit' })
    s = run([{ type: 'RETRY' }], s)
    expect(s.step).toBe('response')
    s = run([A('left')], s)
    expect(s.step).toBe('feedback')
    expect(misconceptions(s)).toEqual({ observed: ['misconception_revenue_vs_profit'], resolved: ['misconception_revenue_vs_profit'], open: [] })
  })

  it('incorrect pathway: two misses on practice and a wrong check → needs_review, misconceptions stay open', () => {
    const s = run([...TO_RESPONSE, A('sales'), N, A('sales'), { type: 'RETRY' }, A('goods_only'), N, A('up'), N, { type: 'NOT_NOW' }])
    expect(s.step).toBe('complete')
    expect(s.result).toBe('needs_review')
    expect(s.challengeAccepted).toBe(false)
    expect(misconceptions(s).open).toEqual(['misconception_revenue_vs_profit', 'misconception_ignores_hidden_costs'])
  })

  it('practice right on the second try + check right → "developing" (not understood)', () => {
    const s = run([...TO_RESPONSE, A('left'), N, A('goods_only'), { type: 'RETRY' }, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }])
    expect(s.result).toBe('developing')
    expect(misconceptions(s).resolved).toEqual(['misconception_ignores_hidden_costs'])
    expect(evaluate(s)).toBe('developing')
  })
})

describe('guards and invalid events (no-ops)', () => {
  it('cannot skip a question with NEXT while it is being asked', () => {
    const s = run(TO_RESPONSE)
    expect(s.step).toBe('response')
    expect(canAdvance(s)).toBe(false)
    expect(transition(s, N, ctx)).toBe(s)
    const p = run([A('left'), N], s)
    expect(p.step).toBe('practice')
    expect(transition(p, N, ctx)).toBe(p)
  })

  it('ignores answers on non-question steps, unknown options and double answers', () => {
    const s = fresh()
    expect(transition(s, A('left'), ctx)).toBe(s)
    const r = run(TO_RESPONSE)
    expect(transition(r, A('nope'), ctx)).toBe(r)
    const p = run([A('left'), N, A('profit')], r)
    expect(transition(p, A('sales'), ctx)).toBe(p)
  })

  it('allows at most 2 attempts on response/practice and none after a correct answer', () => {
    const twice = run([...TO_RESPONSE, A('sales'), { type: 'RETRY' }, A('added')])
    expect(twice.questions.response.attempts).toHaveLength(2)
    expect(transition(twice, { type: 'RETRY' }, ctx)).toBe(twice)
    const right = run([...TO_RESPONSE, A('left')])
    expect(transition(right, { type: 'RETRY' }, ctx)).toBe(right)
  })

  it('the comprehension check is answered once (no retry)', () => {
    const s = run([...TO_RESPONSE, A('left'), N, A('profit'), N, A('up')])
    expect(s.step).toBe('check')
    expect(transition(s, { type: 'RETRY' }, ctx)).toBe(s)
  })

  it('complete is terminal', () => {
    const done = run([...TO_RESPONSE, A('left'), N, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }])
    for (const e of [N, A('left'), { type: 'REPEAT' } as const, { type: 'ACCEPT_CHALLENGE' } as const]) expect(transition(done, e, ctx)).toBe(done)
  })
})

describe('Repeat and Explain another way', () => {
  it('REPEAT counts replays without changing the step', () => {
    const s = run([N, { type: 'REPEAT' }, { type: 'REPEAT' }])
    expect(s.step).toBe('intro')
    expect(s.repeats).toBe(2)
  })

  it('EXPLAIN_ANOTHER_WAY cycles through the variants of the current step', () => {
    let s = run([N])
    const seen = [s.variant.intro ?? 0]
    for (let i = 0; i < 3; i++) {
      s = transition(s, { type: 'EXPLAIN_ANOTHER_WAY' }, ctx)
      seen.push(s.variant.intro!)
    }
    expect(seen).toEqual([0, 1, 2, 0])
    expect(s.anotherWay).toBe(3)
  })

  it('is a no-op on steps without alternative explanations', () => {
    const s = run(TO_RESPONSE)
    expect(transition(s, { type: 'EXPLAIN_ANOTHER_WAY' }, ctx)).toBe(s)
  })
})

describe('saving and resuming', () => {
  it('a half-finished lesson is saved and resumes at the same step with the same answers', () => {
    const store = new MemoryStore()
    const s = run([...TO_RESPONSE, A('sales'), { type: 'RETRY' }, A('left'), N])
    saveLesson(store, 'L1', s)
    const back = loadLesson(store, 'L1', 'revenue_vs_profit')!
    expect(back).toEqual(s)
    expect(back.step).toBe('practice')
    // continuing works on the restored state
    expect(run([A('profit')], back).questions.practice.phase).toBe('feedback')
  })

  it('discards corrupted or mismatched data', () => {
    const store = new MemoryStore()
    store.setItem(lessonKey('L1', 'revenue_vs_profit'), '{oops')
    expect(loadLesson(store, 'L1', 'revenue_vs_profit')).toBeNull()
    store.setItem(lessonKey('L1', 'revenue_vs_profit'), JSON.stringify({ ...fresh(), step: 'flying' }))
    expect(loadLesson(store, 'L1', 'revenue_vs_profit')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { ITEM_BANK, ITEMS_BY_ID, LESSON_CATALOG, MISCONCEPTION_TAXONOMY } from '../bank'
import { currentItemId, conceptLevels, finalize, recommend, renderQuestion, scoreAnswer, selectItems, startAssessment, submitAnswer } from '../engine'
import { CONCEPTS, type AssessmentSession, type ConceptLevel, type ItemSpec, type ScoredAnswer } from '../types'
import type { Business } from '../../lib/calc'

const NOW = '2026-10-28T10:00:00.000Z'
const correctOf = (itemId: string) => ITEMS_BY_ID[itemId].options.find((o) => o.outcome.kind === 'correct')!.id
const firstMisOf = (itemId: string) => ITEMS_BY_ID[itemId].options.find((o) => o.outcome.kind === 'misconception')!.id

function run(business: Business, choose: (itemId: string) => string, attempt = 1, lang: 'en' | 'hi' | 'te' = 'en'): AssessmentSession {
  let s = startAssessment({ learnerId: 'L1', business, attempt, now: NOW, id: `s${attempt}` })
  for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: choose(id), source: 'tap', lang, answeredAt: NOW }).session
  return s
}

describe('few-shot examples from the brief', () => {
  it('Example 1 — vegetable stall, "Yes" to "Is your profit ₹500?" → misconception_revenue_vs_profit → revenue_vs_profit', () => {
    const q = renderQuestion('rvp_a_is_sales_profit', 'vegetable', 'en')
    expect(q.stem).toBe('You sold ₹500 worth of vegetables and spent ₹300 on the vegetables sold. Is your profit ₹500?')
    const r = scoreAnswer('rvp_a_is_sales_profit', 'yes')
    expect(r.classification).toBe('misconception_revenue_vs_profit')
    expect(r.provisionalLesson).toBe('revenue_vs_profit')
  })

  it('Example 2 — grocery shop, "No" to credit-as-cash → understands_customer_credit, continue_assessment', () => {
    const q = renderQuestion('crd_a_credit_is_cash', 'grocery', 'en')
    expect(q.stem).toBe('A customer buys ₹100 of groceries but will pay tomorrow. Is that ₹100 cash you received today?')
    let s = startAssessment({ learnerId: 'L1', business: 'grocery', attempt: 1, now: NOW })
    // answer the questions before the credit item correctly
    while (s.itemIds[s.answers.length] !== 'crd_a_credit_is_cash') {
      const id = s.itemIds[s.answers.length]
      s = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: 'en', answeredAt: NOW }).session
    }
    const r = submitAnswer(s, { itemId: 'crd_a_credit_is_cash', optionId: 'no', source: 'tap', lang: 'en', answeredAt: NOW })
    expect(r.scored.classification).toBe('understands_customer_credit')
    expect(r.nextAction).toBe('continue_assessment')
  })

  it('Example 3 — tea stall, "Yes" to recording home money separately → understands_business_household_separation', () => {
    const q = renderQuestion('sep_a_record_home_money', 'tea', 'en')
    expect(q.stem).toBe('You take ₹200 from the business cash to buy food for your household. Should this be recorded separately?')
    expect(scoreAnswer('sep_a_record_home_money', 'yes').classification).toBe('understands_business_household_separation')
    // It is not the last question in a 5-question assessment, so the flow continues.
    const s = startAssessment({ learnerId: 'L1', business: 'tea', attempt: 1, now: NOW })
    expect(s.itemIds.indexOf('sep_a_record_home_money')).toBeLessThan(s.itemIds.length - 1)
  })
})

describe('assembly', () => {
  it('serves 5 questions by default, one per concept, in curriculum order', () => {
    const ids = selectItems(1)
    expect(ids).toHaveLength(5)
    expect(ids.map((id) => ITEMS_BY_ID[id].concept)).toEqual([...CONCEPTS])
  })

  it('supports 3–5 questions and rejects other lengths', () => {
    expect(selectItems(1, 3).map((id) => ITEMS_BY_ID[id].concept)).toEqual(['revenue_vs_profit', 'customer_credit', 'business_household_separation'])
    expect(selectItems(1, 4)).toHaveLength(4)
    expect(() => selectItems(1, 2)).toThrow(RangeError)
    expect(() => selectItems(1, 6)).toThrow(RangeError)
  })

  it('a retry (attempt 2) asks parallel-form questions, none repeated from attempt 1', () => {
    const a1 = selectItems(1)
    const a2 = selectItems(2)
    expect(a2.every((id) => ITEMS_BY_ID[id].form === 'B')).toBe(true)
    expect(a1.filter((id) => a2.includes(id))).toEqual([])
    expect(selectItems(3)).toEqual(a1)
  })

  it('never serves a draft item', () => {
    const bank: ItemSpec[] = ITEM_BANK.map((i) => (i.id === 'rvp_a_is_sales_profit' ? { ...i, status: 'draft' } : i))
    const ids = selectItems(1, 5, bank)
    expect(ids).not.toContain('rvp_a_is_sales_profit')
    expect(ids).toContain('rvp_b_find_profit')
  })
})

describe('correct responses', () => {
  it('all correct → MVP-core concepts get a foundational AND an applied answer ("consistent"); the others stay "emerging"', () => {
    const r = finalize(run('vegetable', correctOf), { now: NOW })
    // Tiered diagnostic (2026-11-01): 5 foundational + 3 intermediate (sales/profit, costs, two pockets).
    expect(r.answers).toHaveLength(8)
    expect(r.tier).toBe('intermediate')
    expect(r.conceptLevels).toEqual({ revenue_vs_profit: 'consistent', business_expenses: 'consistent', business_household_separation: 'consistent', customer_credit: 'emerging', savings_cash_management: 'emerging' })
    expect(r.misconceptions).toEqual([])
    expect(r.recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', reason: 'next_in_path', alsoReview: [] })
  })

  it('all correct with lesson 1 already completed → recommends the next lesson in the path', () => {
    const r = finalize(run('tea', correctOf), { now: NOW, completedLessons: ['revenue_vs_profit'] })
    expect(r.recommendation.lessonId).toBe('business_expenses')
  })

  it('"consistent" needs two correct answers on different items across attempts', () => {
    const first = finalize(run('grocery', correctOf, 1), { now: NOW })
    const second = finalize(run('grocery', correctOf, 2), { now: NOW, previousResults: [first] })
    expect(Object.values(second.conceptLevels)).toEqual(CONCEPTS.map(() => 'consistent'))
  })

  it('the same item answered correctly twice is still only "emerging"', () => {
    const a = finalize(run('vegetable', correctOf, 1), { now: NOW }).answers.filter((x) => ITEMS_BY_ID[x.itemId].form === 'A')
    expect(conceptLevels([...a, ...a]).revenue_vs_profit).toBe('emerging')
  })
})

describe('incorrect responses', () => {
  it.each(ITEM_BANK.flatMap((i) => i.options.filter((o) => o.outcome.kind === 'misconception').map((o) => [i.id, o.id] as const)))(
    '%s / %s → misconception classification and its mapped lesson',
    (itemId, optionId) => {
      const r = scoreAnswer(itemId, optionId)
      expect(r.classification.startsWith('misconception_')).toBe(true)
      expect(r.provisionalLesson).toBe(MISCONCEPTION_TAXONOMY[r.classification as keyof typeof MISCONCEPTION_TAXONOMY].lesson)
      expect(MISCONCEPTION_TAXONOMY[r.classification as keyof typeof MISCONCEPTION_TAXONOMY].concept).toBe(ITEMS_BY_ID[itemId].concept)
    },
  )

  it('a single misconception decides the recommendation', () => {
    const s = run('vegetable', (id) => (id === 'crd_a_credit_is_cash' ? 'yes' : correctOf(id)))
    const r = finalize(s, { now: NOW })
    expect(r.conceptLevels.customer_credit).toBe('gap')
    expect(r.recommendation).toMatchObject({ lessonId: 'customer_credit', reason: 'misconception', misconceptions: ['misconception_credit_as_cash'] })
  })

  it('several misconceptions: MVP lesson order decides, others listed in alsoReview (2026-11-01: MVP order replaces severity)', () => {
    const r = finalize(run('tea', firstMisOf), { now: NOW })
    expect(r.tier).toBe('foundational')
    expect(r.answers).toHaveLength(5) // gate not passed: no harder questions
    expect(r.recommendation.lessonId).toBe('revenue_vs_profit')
    expect(r.recommendation.alsoReview).toEqual(['business_expenses', 'business_household_separation', 'customer_credit', 'savings_cash_management'])
    expect(r.mainMisconceptions).toEqual(['misconception_revenue_vs_profit', 'misconception_household_as_business_expense'])
  })

  it('misconception outranks "not sure"', () => {
    const r = finalize(
      run('grocery', (id) => (id === 'rvp_a_is_sales_profit' ? 'unsure' : id === 'sep_a_record_home_money' ? 'no' : correctOf(id))),
      { now: NOW },
    )
    expect(r.conceptLevels.revenue_vs_profit).toBe('unsure')
    expect(r.recommendation).toMatchObject({ lessonId: 'business_household_separation', reason: 'misconception', alsoReview: ['revenue_vs_profit'] })
  })

  it('a later wrong answer brings a concept back to "gap"', () => {
    const first = finalize(run('vegetable', correctOf, 1), { now: NOW })
    const second = finalize(run('vegetable', (id) => (ITEMS_BY_ID[id].concept === 'revenue_vs_profit' ? 'sales' : correctOf(id)), 2), { now: NOW, previousResults: [first] })
    expect(second.conceptLevels.revenue_vs_profit).toBe('gap')
    expect(second.recommendation.lessonId).toBe('revenue_vs_profit')
  })
})

describe('incomplete assessments', () => {
  it('cannot be finalized', () => {
    let s = startAssessment({ learnerId: 'L1', business: 'tea', attempt: 1, now: NOW })
    s = submitAnswer(s, { itemId: s.itemIds[0], optionId: correctOf(s.itemIds[0]), source: 'tap', lang: 'en', answeredAt: NOW }).session
    expect(() => finalize(s, { now: NOW })).toThrow(/incomplete/)
  })

  it('rejects out-of-order answers, unknown options and answers after completion', () => {
    const s = startAssessment({ learnerId: 'L1', business: 'tea', attempt: 1, now: NOW })
    expect(() => submitAnswer(s, { itemId: s.itemIds[1], optionId: 'yes', source: 'tap', lang: 'en', answeredAt: NOW })).toThrow(/Expected/)
    expect(() => submitAnswer(s, { itemId: s.itemIds[0], optionId: 'maybe', source: 'tap', lang: 'en', answeredAt: NOW })).toThrow(/Unknown option/)
    const done = run('tea', correctOf)
    expect(() => submitAnswer(done, { itemId: done.itemIds[0], optionId: 'yes', source: 'tap', lang: 'en', answeredAt: NOW })).toThrow(/complete/)
  })

  it('the last answer returns complete_assessment', () => {
    let s = startAssessment({ learnerId: 'L1', business: 'grocery', attempt: 1, now: NOW, length: 3 })
    const actions = s.itemIds.map((id) => {
      const r = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: 'en', answeredAt: NOW })
      s = r.session
      return r.nextAction
    })
    expect(actions).toEqual(['continue_assessment', 'continue_assessment', 'complete_assessment'])
  })

  it('a 3-question assessment treats the unasked concepts as not assessed and recommends one of them when all answers are correct', () => {
    let s = startAssessment({ learnerId: 'L1', business: 'grocery', attempt: 1, now: NOW, length: 3 })
    for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: 'en', answeredAt: NOW }).session
    const r = finalize(s, { now: NOW })
    expect(r.conceptLevels.business_expenses).toBe('not_assessed')
    expect(r.recommendation).toMatchObject({ lessonId: 'business_expenses', reason: 'not_assessed' })
  })
})

describe('recommendation uses approved lessons only', () => {
  it('skips a lesson that is not approved', () => {
    const levels = Object.fromEntries(CONCEPTS.map((c) => [c, 'emerging'])) as Record<(typeof CONCEPTS)[number], ConceptLevel>
    levels.revenue_vs_profit = 'gap'
    levels.customer_credit = 'gap'
    const catalog = LESSON_CATALOG.map((l) => (l.id === 'revenue_vs_profit' ? { ...l, status: 'draft' as const } : l))
    const r = recommend(levels, ['misconception_revenue_vs_profit', 'misconception_credit_as_cash'], { catalog })
    expect(r.lessonId).toBe('customer_credit')
  })

  it('ignores answers from a different learner in previous results', () => {
    const other = { ...finalize(run('vegetable', firstMisOf, 1), { now: NOW }), learnerId: 'someone-else' }
    const r = finalize(run('vegetable', correctOf, 2), { now: NOW, previousResults: [other] })
    expect(Object.values(r.conceptLevels).every((l) => l === 'emerging')).toBe(true)
  })
})

describe('result shape', () => {
  it('stores option ids and classifications, not rendered text', () => {
    const r = finalize(run('vegetable', correctOf), { now: NOW })
    const a: ScoredAnswer = r.answers[0]
    expect(Object.keys(a).sort()).toEqual(['answeredAt', 'classification', 'concept', 'itemId', 'lang', 'optionId', 'outcome', 'source'].sort())
  })
})

describe('two-tier diagnostic (2026-11-01, docs/DIAGNOSTIC_STRATEGY.md)', () => {
  const answerAll = (business: 'vegetable' | 'tea' | 'grocery', choose: (id: string) => string) => {
    let s = startAssessment({ learnerId: 'T', business, attempt: 1, now: NOW })
    const unlocks: number[] = []
    for (let id = currentItemId(s); id; id = currentItemId(s)) {
      const r = submitAnswer(s, { itemId: id, optionId: choose(id), source: 'tap', lang: 'en', answeredAt: NOW })
      if (r.tierUnlocked) unlocks.push(r.session.answers.length)
      s = r.session
    }
    return { s, unlocks, r: finalize(s, { now: NOW }) }
  }
  it('starts with 5 foundational (form A) questions, one per concept', () => {
    const s = startAssessment({ learnerId: 'T', business: 'vegetable', attempt: 1, now: NOW })
    expect(s.mode).toBe('staged')
    expect(s.itemIds.map((id) => ITEMS_BY_ID[id].form)).toEqual(['A', 'A', 'A', 'A', 'A'])
  })
  it('4 of 5 right incl. sales/profit → unlocks harder questions only for MVP-core concepts she got right', () => {
    const { s, unlocks, r } = answerAll('tea', (id) => (id === 'exp_a_which_is_expense' ? 'school' : correctOf(id)))
    expect(unlocks).toEqual([5])
    expect(s.itemIds.slice(5)).toEqual(['rvp_b_find_profit', 'sep_b_home_money_source']) // costs was wrong → not asked harder
    expect(r.tier).toBe('intermediate')
    expect(r.recommendation).toMatchObject({ lessonId: 'business_expenses', reason: 'misconception' })
  })
  it('sales/profit wrong → stays foundational even with 4 of 5 right (anchor concept)', () => {
    const { unlocks, r } = answerAll('vegetable', (id) => (id === 'rvp_a_is_sales_profit' ? 'yes' : correctOf(id)))
    expect(unlocks).toEqual([])
    expect(r.tier).toBe('foundational')
    expect(r.recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', reason: 'misconception' })
  })
  it('3 of 5 right → stays foundational', () => {
    const { r } = answerAll('grocery', (id) => (['crd_a_credit_is_cash', 'sav_a_keep_stock_money'].includes(id) ? 'unsure' : correctOf(id)))
    expect(r.tier).toBe('foundational')
    expect(r.answers).toHaveLength(5)
    expect(r.recommendation).toMatchObject({ lessonId: 'customer_credit', reason: 'unsure' })
  })
  it('basics right but an applied question missed → "applied_gap" recommendation for that topic', () => {
    const { r } = answerAll('vegetable', (id) => (id === 'exp_b_total_stock_cost' ? 'stock_only' : correctOf(id)))
    expect(r.tier).toBe('intermediate')
    expect(r.recommendation).toMatchObject({ lessonId: 'business_expenses', reason: 'applied_gap', misconceptions: ['misconception_ignores_hidden_costs'] })
    expect(r.mainMisconceptions).toEqual(['misconception_ignores_hidden_costs'])
  })
  it('a foundational misconception outranks an applied gap, and MVP order breaks ties', () => {
    const { r } = answerAll('vegetable', (id) => (id === 'sav_a_keep_stock_money' ? 'yes' : id === 'exp_b_total_stock_cost' ? 'stock_only' : correctOf(id)))
    expect(r.recommendation).toMatchObject({ lessonId: 'savings_cash_management', reason: 'misconception' })
    expect(r.recommendation.alsoReview).toEqual(['business_expenses'])
  })
  it('never more than 8 questions', () => {
    expect(answerAll('tea', correctOf).r.answers.length).toBeLessThanOrEqual(8)
  })
})

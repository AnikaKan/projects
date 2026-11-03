// Practice feedback must diagnose only what the number actually shows (readiness audit 2026-10-30).
import { describe, expect, it } from 'vitest'
import { PRACTICE_SCENARIOS, basicScenario, practiceOptions, profit, scoreNumeric } from '../calc'

describe('scoreNumeric (practice screen)', () => {
  const s = PRACTICE_SCENARIOS.vegetable // ₹1,500 sales, ₹900 stock, ₹100 waste → ₹500 profit
  it('correct profit', () => {
    expect(profit(s)).toBe(500)
    expect(scoreNumeric(s, 500)).toEqual({ correct: true })
  })
  it('sales − stock only → "forgot waste"', () => expect(scoreNumeric(s, 600)).toEqual({ correct: false, misconception: 'IGNORES_WASTE' }))
  it('all the sales → "sales is not profit"', () => expect(scoreNumeric(s, 1500)).toEqual({ correct: false, misconception: 'SALES_AS_PROFIT' }))
  it('any other wrong number gets general guidance, not a misconception label', () => {
    for (const v of [450, 400, 2000, 0]) expect(scoreNumeric(s, v)).toEqual({ correct: false })
  })
  it('costs added instead of taken away → "adds costs" (new in the tiered practice)', () => {
    expect(scoreNumeric(s, 2500)).toEqual({ correct: false, misconception: 'ADDS_COSTS' })
  })
  it('foundational practice uses two numbers only: options are left / all sales / costs added', () => {
    const b = basicScenario(s)
    expect(profit(b)).toBe(600)
    expect(practiceOptions(b).map((o) => [o.value, o.correct, o.misconception])).toEqual([
      [600, true, undefined],
      [1500, false, 'SALES_AS_PROFIT'],
      [2400, false, 'ADDS_COSTS'],
    ])
    expect(scoreNumeric(b, 600)).toEqual({ correct: true })
  })
})

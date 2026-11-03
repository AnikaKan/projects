// Deterministic calculation engine (prototype slice). All money is integer rupees.
// The UI never hard-codes a derived amount: it always asks this module.

export type Business = 'vegetable' | 'tea' | 'grocery'
export type Misconception = 'SALES_AS_PROFIT' | 'IGNORES_WASTE' | 'ADDS_COSTS'

export interface Scenario {
  sales: number
  stock: number
  waste: number
}

export const profit = (s: Scenario): number => s.sales - s.stock - s.waste

/** Fictional, pre-authored scenario values per business (content data, not AI-generated). */
export const LESSON_SCENARIOS: Record<Business, Scenario> = {
  vegetable: { sales: 1200, stock: 750, waste: 50 },
  tea: { sales: 900, stock: 480, waste: 20 },
  grocery: { sales: 2500, stock: 1850, waste: 50 },
}

export const PRACTICE_SCENARIOS: Record<Business, Scenario> = {
  vegetable: { sales: 1500, stock: 900, waste: 100 },
  tea: { sales: 1100, stock: 600, waste: 50 },
  grocery: { sales: 3000, stock: 2200, waste: 100 },
}

/** Foundational practice: the same day without spoiled goods (two numbers only). */
export const basicScenario = (s: Scenario): Scenario => ({ ...s, waste: 0 })

export const DIAG_SCENARIO = { sales: 1000, stock: 700, creditAmount: 200 }

export interface AnswerOption {
  id: string
  value: number
  correct: boolean
  misconception?: Misconception
}

/** Options with distractors derived from known misconceptions. */
export function practiceOptions(s: Scenario): AnswerOption[] {
  // Foundational practice (no spoiled goods): the distractors are "all the sales" and "costs added".
  if (s.waste === 0)
    return [
      { id: 'a', value: profit(s), correct: true },
      { id: 'b', value: s.sales, correct: false, misconception: 'SALES_AS_PROFIT' },
      { id: 'c', value: s.sales + s.stock, correct: false, misconception: 'ADDS_COSTS' },
    ]
  return [
    { id: 'a', value: s.sales - s.stock, correct: false, misconception: 'IGNORES_WASTE' },
    { id: 'b', value: profit(s), correct: true },
    { id: 'c', value: s.sales, correct: false, misconception: 'SALES_AS_PROFIT' },
  ]
}

/** Score a typed or tapped numeric answer deterministically. */
/**
 * A wrong answer is labelled with a misconception only when it is the number that misconception produces.
 * Any other wrong number (e.g. an arithmetic slip) gets general guidance — never a wrong diagnosis
 * (readiness audit 2026-10-30: every wrong number used to be reported as "took all the sales money").
 */
export function scoreNumeric(s: Scenario, value: number): { correct: boolean; misconception?: Misconception } {
  if (value === profit(s)) return { correct: true }
  if (value === s.sales + s.stock + s.waste) return { correct: false, misconception: 'ADDS_COSTS' }
  if (s.waste > 0 && value === s.sales - s.stock) return { correct: false, misconception: 'IGNORES_WASTE' }
  if (value === s.sales) return { correct: false, misconception: 'SALES_AS_PROFIT' }
  return { correct: false }
}

export const inr = (n: number): string =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)

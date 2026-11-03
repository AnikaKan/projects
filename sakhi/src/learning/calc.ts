// Deterministic lesson arithmetic. All values are integer rupees; no AI, no floating point.
import type { ScenarioNumbers } from './types'

export interface DerivedValues {
  sales: number
  goodsCost: number
  /** Left after paying for the goods sold (before other costs). */
  left: number
  otherTotal: number
  /** Final profit after all listed costs. */
  profit: number
  /** Distractor used for the "costs are added" misconception. */
  salesPlusGoods: number
  /** All costs together (goods + other). */
  allCosts: number
  /** Sales given on udhaar, and the cash actually in the box today. */
  credit: number
  cashInBox: number
  [otherCostKey: string]: number
}

export function deriveValues(n: ScenarioNumbers): DerivedValues {
  for (const v of [n.sales, n.goodsCost, n.creditSales ?? 0, ...Object.values(n.otherCosts)]) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`Amounts must be non-negative whole rupees, got ${v}`)
  }
  const otherTotal = Object.values(n.otherCosts).reduce((a, b) => a + b, 0)
  return {
    ...n.otherCosts,
    sales: n.sales,
    goodsCost: n.goodsCost,
    left: n.sales - n.goodsCost,
    otherTotal,
    profit: n.sales - n.goodsCost - otherTotal,
    salesPlusGoods: n.sales + n.goodsCost,
    allCosts: n.goodsCost + otherTotal,
    credit: n.creditSales ?? 0,
    cashInBox: n.sales - (n.creditSales ?? 0),
  }
}

/** Values for the comprehension check, which compares two days. */
export function deriveCheckValues(before: ScenarioNumbers, after: ScenarioNumbers) {
  const b = deriveValues(before)
  const a = deriveValues(after)
  return {
    salesBefore: b.sales,
    salesAfter: a.sales,
    costBefore: b.goodsCost + b.otherTotal,
    costAfter: a.goodsCost + a.otherTotal,
    profitBefore: b.profit,
    profitAfter: a.profit,
    profitChange: a.profit - b.profit,
  }
}

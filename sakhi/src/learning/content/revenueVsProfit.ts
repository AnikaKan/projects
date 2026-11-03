// Lesson: Sales vs profit (module m1). Numbers and answer keys are language-free.
// Approved content v1.0. Text lives in revenueVsProfit.text.ts.
import type { LessonContent } from '../types'
import { REVENUE_VS_PROFIT_TEXT } from './revenueVsProfit.text'

export const REVENUE_VS_PROFIT: LessonContent = {
  id: 'revenue_vs_profit',
  version: '1.0',
  status: 'approved',
  // Fictional amounts. Vegetable example is the PRD demo: ₹500 sales, ₹300 vegetables → ₹200 left.
  scenarios: {
    vegetable: {
      example: { sales: 500, goodsCost: 300, otherCosts: { spoilage: 40, transport: 30 } },
      practice: { sales: 800, goodsCost: 450, otherCosts: { spoilage: 50, transport: 30 } },
      checkBefore: { sales: 500, goodsCost: 300, otherCosts: {} },
      checkAfter: { sales: 700, goodsCost: 550, otherCosts: {} },
    },
    tea: {
      example: { sales: 600, goodsCost: 350, otherCosts: { fuel: 60 } },
      practice: { sales: 900, goodsCost: 450, otherCosts: { fuel: 80 } },
      checkBefore: { sales: 600, goodsCost: 350, otherCosts: {} },
      checkAfter: { sales: 800, goodsCost: 600, otherCosts: {} },
    },
    grocery: {
      example: { sales: 1500, goodsCost: 1200, otherCosts: { bags: 50 }, creditSales: 200 },
      practice: { sales: 2000, goodsCost: 1500, otherCosts: { bags: 100 } },
      checkBefore: { sales: 1500, goodsCost: 1200, otherCosts: {} },
      checkAfter: { sales: 1800, goodsCost: 1550, otherCosts: {} },
    },
  },
  questions: {
    response: {
      id: 'response',
      scenario: 'example',
      maxAttempts: 2,
      options: [
        { id: 'left', amountOf: 'left', outcome: { kind: 'correct' } },
        { id: 'sales', amountOf: 'sales', outcome: { kind: 'misconception', code: 'misconception_revenue_vs_profit' } },
        { id: 'added', amountOf: 'salesPlusGoods', outcome: { kind: 'misconception', code: 'misconception_profit_adds_costs' } },
        { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
      ],
    },
    practice: {
      id: 'practice',
      scenario: 'practice',
      maxAttempts: 2,
      options: [
        { id: 'goods_only', amountOf: 'left', outcome: { kind: 'misconception', code: 'misconception_ignores_hidden_costs' } },
        { id: 'profit', amountOf: 'profit', outcome: { kind: 'correct' } },
        { id: 'sales', amountOf: 'sales', outcome: { kind: 'misconception', code: 'misconception_revenue_vs_profit' } },
        { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
      ],
    },
    check: {
      id: 'check',
      scenario: 'checkBefore',
      maxAttempts: 1, // a comprehension check is answered once
      options: [
        { id: 'up', labelKey: 'opt.up', outcome: { kind: 'misconception', code: 'misconception_revenue_vs_profit' } },
        { id: 'down', labelKey: 'opt.down', outcome: { kind: 'correct' } },
        { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
      ],
    },
  },
  explainVariants: { intro: 3, example: 2, feedback: 2 },
  text: REVENUE_VS_PROFIT_TEXT,
}

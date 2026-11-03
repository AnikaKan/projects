// Approved item bank, misconception taxonomy and lesson catalog.
// All amounts are fictional integer rupees. Derived values are computed here, once, for every language.

import type { Concept, ItemSpec, LessonEntry, LessonId, MisconceptionCode } from './types'

const yes = (correct: boolean, code: MisconceptionCode): ItemSpec['options'] => [
  { id: 'yes', labelKey: 'opt.yes', outcome: correct ? { kind: 'correct' } : { kind: 'misconception', code } },
  { id: 'no', labelKey: 'opt.no', outcome: correct ? { kind: 'misconception', code } : { kind: 'correct' } },
  { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
]

export const ITEM_BANK: ItemSpec[] = [
  // ── Revenue vs profit ────────────────────────────────────────────
  {
    id: 'rvp_a_is_sales_profit',
    concept: 'revenue_vs_profit',
    form: 'A',
    kind: 'yes_no',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.rvp_a',
    explanationKey: 'x.rvp',
    params: { vegetable: { sales: 500, cost: 300 }, tea: { sales: 400, cost: 250 }, grocery: { sales: 800, cost: 600 } },
    derive: (p) => ({ profit: p.sales - p.cost }),
    // Correct answer is "No": profit is not the whole sales amount.
    options: yes(false, 'misconception_revenue_vs_profit'),
  },
  {
    id: 'rvp_b_find_profit',
    concept: 'revenue_vs_profit',
    form: 'B',
    kind: 'amount_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.rvp_b',
    explanationKey: 'x.rvp',
    params: { vegetable: { sales: 1000, cost: 700 }, tea: { sales: 600, cost: 350 }, grocery: { sales: 1500, cost: 1100 } },
    derive: (p) => ({ profit: p.sales - p.cost, salesPlusCost: p.sales + p.cost }),
    options: [
      { id: 'profit', amountOf: 'profit', outcome: { kind: 'correct' } },
      { id: 'sales', amountOf: 'sales', outcome: { kind: 'misconception', code: 'misconception_revenue_vs_profit' } },
      { id: 'sum', amountOf: 'salesPlusCost', outcome: { kind: 'misconception', code: 'misconception_profit_adds_costs' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },

  // ── Business expenses ────────────────────────────────────────────
  {
    id: 'exp_a_which_is_expense',
    concept: 'business_expenses',
    form: 'A',
    kind: 'single_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.exp_a',
    explanationKey: 'x.exp_a',
    params: { vegetable: {}, tea: {}, grocery: {} },
    derive: () => ({}),
    options: [
      { id: 'stock', labelKey: 'opt.exp_stock.{business}', outcome: { kind: 'correct' } },
      { id: 'school', labelKey: 'opt.exp_school', outcome: { kind: 'misconception', code: 'misconception_household_as_business_expense' } },
      { id: 'clothes', labelKey: 'opt.exp_clothes', outcome: { kind: 'misconception', code: 'misconception_household_as_business_expense' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },
  {
    id: 'exp_b_total_stock_cost',
    concept: 'business_expenses',
    form: 'B',
    kind: 'amount_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.exp_b',
    explanationKey: 'x.exp_b',
    params: { vegetable: { stock: 600, transport: 50 }, tea: { stock: 400, transport: 40 }, grocery: { stock: 1500, transport: 100 } },
    derive: (p) => ({ total: p.stock + p.transport }),
    options: [
      { id: 'total', amountOf: 'total', outcome: { kind: 'correct' } },
      { id: 'stock_only', amountOf: 'stock', outcome: { kind: 'misconception', code: 'misconception_ignores_hidden_costs' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },

  // ── Customer credit ──────────────────────────────────────────────
  {
    id: 'crd_a_credit_is_cash',
    concept: 'customer_credit',
    form: 'A',
    kind: 'yes_no',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.crd_a',
    explanationKey: 'x.crd_a',
    params: { vegetable: { amount: 60 }, tea: { amount: 50 }, grocery: { amount: 100 } },
    derive: () => ({}),
    options: yes(false, 'misconception_credit_as_cash'),
  },
  {
    id: 'crd_b_cash_in_box',
    concept: 'customer_credit',
    form: 'B',
    kind: 'amount_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.crd_b',
    explanationKey: 'x.crd_b',
    params: { vegetable: { cash: 700, credit: 200 }, tea: { cash: 450, credit: 150 }, grocery: { cash: 1200, credit: 300 } },
    derive: (p) => ({ both: p.cash + p.credit }),
    options: [
      { id: 'cash', amountOf: 'cash', outcome: { kind: 'correct' } },
      { id: 'both', amountOf: 'both', outcome: { kind: 'misconception', code: 'misconception_credit_as_cash' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },

  // ── Savings and cash management ──────────────────────────────────
  {
    id: 'sav_a_keep_stock_money',
    concept: 'savings_cash_management',
    form: 'A',
    kind: 'yes_no',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.sav_a',
    explanationKey: 'x.sav_a',
    params: { vegetable: { box: 900, stock: 600 }, tea: { box: 700, stock: 400 }, grocery: { box: 2000, stock: 1500 } },
    derive: (p) => ({ spare: p.box - p.stock }),
    options: yes(false, 'misconception_spends_working_capital'),
  },
  {
    id: 'sav_b_where_to_save',
    concept: 'savings_cash_management',
    form: 'B',
    kind: 'single_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.sav_b',
    explanationKey: 'x.sav_b',
    params: { vegetable: {}, tea: {}, grocery: {} },
    derive: () => ({}),
    options: [
      { id: 'mixed', labelKey: 'opt.sav_mixed', outcome: { kind: 'misconception', code: 'misconception_savings_mixed_with_cash' } },
      { id: 'separate', labelKey: 'opt.sav_separate', outcome: { kind: 'correct' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },

  // ── Business vs household money ──────────────────────────────────
  {
    id: 'sep_a_record_home_money',
    concept: 'business_household_separation',
    form: 'A',
    kind: 'yes_no',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.sep_a',
    explanationKey: 'x.sep_a',
    params: { vegetable: { amount: 150 }, tea: { amount: 200 }, grocery: { amount: 300 } },
    derive: () => ({}),
    // Correct answer is "Yes".
    options: yes(true, 'misconception_mixes_business_household'),
  },
  {
    id: 'sep_b_home_money_source',
    concept: 'business_household_separation',
    form: 'B',
    kind: 'single_choice',
    status: 'approved',
    contentVersion: '1.0',
    stemKey: 'q.sep_b',
    explanationKey: 'x.sep_b',
    params: { vegetable: {}, tea: {}, grocery: {} },
    derive: () => ({}),
    options: [
      { id: 'cashbox', labelKey: 'opt.sep_cashbox', outcome: { kind: 'misconception', code: 'misconception_mixes_business_household' } },
      { id: 'fixed', labelKey: 'opt.sep_fixed', outcome: { kind: 'correct' } },
      { id: 'unsure', labelKey: 'opt.unsure', outcome: { kind: 'unsure' } },
    ],
  },
]

export const ITEMS_BY_ID: Record<string, ItemSpec> = Object.fromEntries(ITEM_BANK.map((i) => [i.id, i]))

/** Misconception taxonomy: each code belongs to exactly one concept and maps to one lesson. */
export const MISCONCEPTION_TAXONOMY: Record<MisconceptionCode, { concept: Concept; lesson: LessonId; severity: 1 | 2 | 3 }> = {
  misconception_revenue_vs_profit: { concept: 'revenue_vs_profit', lesson: 'revenue_vs_profit', severity: 3 },
  misconception_profit_adds_costs: { concept: 'revenue_vs_profit', lesson: 'revenue_vs_profit', severity: 3 },
  misconception_household_as_business_expense: { concept: 'business_expenses', lesson: 'business_expenses', severity: 2 },
  misconception_ignores_hidden_costs: { concept: 'business_expenses', lesson: 'business_expenses', severity: 2 },
  misconception_credit_as_cash: { concept: 'customer_credit', lesson: 'customer_credit', severity: 3 },
  misconception_spends_working_capital: { concept: 'savings_cash_management', lesson: 'savings_cash_management', severity: 3 },
  misconception_savings_mixed_with_cash: { concept: 'savings_cash_management', lesson: 'savings_cash_management', severity: 1 },
  misconception_mixes_business_household: { concept: 'business_household_separation', lesson: 'business_household_separation', severity: 2 },
}

/**
 * Lesson catalog. Only `approved` lessons can be recommended.
 * NOTE: approval here is the in-app content status. Real sign-off by the NGO curriculum lead
 * (and native-speaker review of hi/te) is still required before field use.
 */
export const LESSON_CATALOG: LessonEntry[] = [
  { id: 'revenue_vs_profit', concept: 'revenue_vs_profit', moduleId: 'm1', status: 'approved', contentVersion: '1.0' },
  { id: 'business_expenses', concept: 'business_expenses', moduleId: 'm2', status: 'approved', contentVersion: '1.0' },
  { id: 'customer_credit', concept: 'customer_credit', moduleId: 'm3', status: 'approved', contentVersion: '1.0' },
  { id: 'savings_cash_management', concept: 'savings_cash_management', moduleId: 'm4', status: 'approved', contentVersion: '1.0' },
  { id: 'business_household_separation', concept: 'business_household_separation', moduleId: 'm5', status: 'approved', contentVersion: '1.0' },
]

// Business Helper: deterministic, typed workflows for two educational calculation tools.
// · Check My Price: does a price cover the costs SHE names? (never "the right price")
// · Understand My Money: sales vs profit · everyday costs · cash vs credit (udhaar) · shop vs home money
// All arithmetic is here, in integer rupees. No AI. Nothing here is stored: amounts live only in screen state.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { ModuleId } from '../state/AppState'

/** Amounts are whole rupees, 0 … MAX_AMOUNT. Larger numbers look like phone / account numbers and are refused. */
export const MAX_AMOUNT = 100000

export type ToolId = 'price' | 'money' | 'message' | 'loan'
export const TOOLS: { id: ToolId; emoji: string; status: 'ready' | 'soon' }[] = [
  { id: 'price', emoji: '💰', status: 'ready' },
  { id: 'money', emoji: '🧮', status: 'ready' },
  { id: 'message', emoji: '💬', status: 'soon' },
  { id: 'loan', emoji: '🛡️', status: 'soon' },
]

// ── Spoken request → tool (keyword rules per language; no AI) ───────

const INTENT_WORDS: Record<ToolId, Record<Lang, string[]>> = {
  price: {
    en: ['price', 'selling price', 'sell it for', 'how much should i sell', 'rate', 'charge'],
    hi: ['दाम', 'कीमत', 'भाव', 'रेट', 'किस दाम', 'कितने में बेच', 'daam', 'keemat', 'bhav'],
    te: ['ధర', 'రేటు', 'ఎంతకు అమ్మ', 'dhara'],
  },
  money: {
    en: ['profit', 'money', 'sales', 'expense', 'cost', 'udhaar', 'credit', 'owe', 'household', 'home money', 'calculate'],
    hi: ['मुनाफ़ा', 'मुनाफा', 'पैसा', 'पैसे', 'बिक्री', 'खर्च', 'उधार', 'हिसाब', 'घर का', 'munafa', 'paisa', 'hisaab', 'udhaar'],
    te: ['లాభం', 'డబ్బు', 'అమ్మకాలు', 'ఖర్చు', 'ఉద్దెర', 'అప్పు', 'లెక్క', 'ఇంటి'],
  },
  message: {
    en: ['message', 'customer message', 'whatsapp', 'announce', 'tell my customers'],
    hi: ['संदेश', 'मैसेज', 'ग्राहकों को बता', 'message'],
    te: ['సందేశం', 'మెసేజ్', 'కస్టమర్లకు చెప్ప'],
  },
  loan: {
    en: ['loan', 'interest', 'borrow', 'emi', 'repay'],
    hi: ['लोन', 'कर्ज', 'क़र्ज़', 'ब्याज', 'ऋण', 'loan'],
    te: ['లోన్', 'రుణం', 'వడ్డీ', 'అప్పు తీసుకో'],
  },
}

/**
 * Which tool a spoken request asks for. Order matters: "loan" and "message" are checked first (so
 * "loan interest money" is not read as the money tool), then price, then money. Returns null if none.
 */
export function routeRequest(transcript: string, lang: Lang): ToolId | null {
  const t = ` ${transcript.toLowerCase().replace(/[.,!?।]/g, ' ')} `
  // Latin words match whole words only ("rate" must not match "separate"); Indian scripts match as substrings
  // (suffixes attach to the word: "दाम में", "ధరకు").
  const has = (w: string) => (/^[a-z ]+$/.test(w) ? new RegExp(`\\b${w}\\b`).test(t) : t.includes(w.toLowerCase()))
  for (const tool of ['loan', 'message', 'price', 'money'] as ToolId[]) {
    if ([...INTENT_WORDS[tool][lang], ...INTENT_WORDS[tool].en].some(has)) return tool
  }
  return null
}

// ── Check My Price ──────────────────────────────────────────────────

export const PRICE_ITEMS: Record<Business, { id: string; emoji: string }[]> = {
  vegetable: [
    { id: 'vegBasket', emoji: '🧺' },
    { id: 'tomatoes', emoji: '🍅' },
    { id: 'onions', emoji: '🧅' },
    { id: 'other', emoji: '➕' },
  ],
  tea: [
    { id: 'teaCups', emoji: '☕' },
    { id: 'snacks', emoji: '🍪' },
    { id: 'milkPacket', emoji: '🥛' },
    { id: 'other', emoji: '➕' },
  ],
  grocery: [
    { id: 'riceBag', emoji: '🍚' },
    { id: 'oil', emoji: '🛢️' },
    { id: 'soap', emoji: '🧼' },
    { id: 'other', emoji: '➕' },
  ],
}

export type PriceStep = 'item' | 'cost' | 'extra' | 'price' | 'result'
export const PRICE_STEPS: PriceStep[] = ['item', 'cost', 'extra', 'price', 'result']

export interface PriceInputs {
  item: string | null
  cost: number | null
  extra: number | null
  price: number | null
}
export const EMPTY_PRICE: PriceInputs = { item: null, cost: null, extra: null, price: null }

export interface PriceResult {
  price: number
  cost: number
  extra: number
  totalCost: number
  /** price − cost − extra. Can be negative. NOT final net profit: only the costs she named. */
  remaining: number
  verdict: 'covers' | 'breakEven' | 'loss'
  /** She named no extra costs: gently ask whether transport / bags / spoilage were forgotten. */
  noExtras: boolean
  /** Lesson to link: Sales and profit; Everyday costs when she named no other costs. */
  lesson: ModuleId
}

export function checkPrice(i: PriceInputs): PriceResult {
  if (i.cost === null || i.extra === null || i.price === null) throw new Error('All amounts are needed')
  for (const v of [i.cost, i.extra, i.price]) if (!isValidAmount(v)) throw new Error(`Invalid amount ${v}`)
  const totalCost = i.cost + i.extra
  const remaining = i.price - totalCost
  return {
    price: i.price,
    cost: i.cost,
    extra: i.extra,
    totalCost,
    remaining,
    verdict: remaining > 0 ? 'covers' : remaining === 0 ? 'breakEven' : 'loss',
    noExtras: i.extra === 0,
    lesson: 'm1',
  }
}

/** Next step after a step is answered (deterministic). */
export function nextPriceStep(step: PriceStep): PriceStep {
  return PRICE_STEPS[Math.min(PRICE_STEPS.indexOf(step) + 1, PRICE_STEPS.length - 1)]
}
export function prevPriceStep(step: PriceStep): PriceStep | null {
  const i = PRICE_STEPS.indexOf(step)
  return i > 0 ? PRICE_STEPS[i - 1] : null
}

// ── Understand My Money ─────────────────────────────────────────────

export type MoneyScenario = 'salesProfit' | 'expenses' | 'credit' | 'household'
export const MONEY_SCENARIOS: { id: MoneyScenario; emoji: string; lesson: ModuleId }[] = [
  { id: 'salesProfit', emoji: '💰', lesson: 'm1' },
  { id: 'expenses', emoji: '🧾', lesson: 'm2' },
  { id: 'credit', emoji: '🤝', lesson: 'm3' },
  { id: 'household', emoji: '👛', lesson: 'm5' },
]

/** The amount questions for each scenario, in order. Keys are string ids (helperStrings: `bh.q.<key>`). */
export const MONEY_QUESTIONS: Record<MoneyScenario, string[]> = {
  salesProfit: ['sales', 'goodsCost'],
  expenses: ['goodsCost', 'transport', 'smallCosts'],
  credit: ['sales', 'received'],
  household: ['boxMoney', 'takenHome'],
}

export interface MoneyRow {
  key: string
  emoji: string
  amount: number
  /** 'in' = money in, 'out' = taken away, 'owed' = not received yet, 'result' = calculated */
  kind: 'in' | 'out' | 'owed' | 'result'
}
export interface MoneyResult {
  scenario: MoneyScenario
  rows: MoneyRow[]
  /** i18n key of the explanation (`bh.money.<scenario>.<variant>`), filled with `vars`. */
  message: string
  vars: Record<string, number>
  lesson: ModuleId
}

export type MoneyCheck = { ok: true } | { ok: false; key: string; vars?: Record<string, number> }

/** Consistency checks between answers (asked before the result; she can correct the amount). */
export function checkMoneyAnswer(scenario: MoneyScenario, answers: Record<string, number>, key: string, value: number): MoneyCheck {
  if (!isValidAmount(value)) return { ok: false, key: 'bh.err.range', vars: { max: MAX_AMOUNT } }
  if (scenario === 'credit' && key === 'received' && value > answers.sales) return { ok: false, key: 'bh.err.receivedMore', vars: { sales: answers.sales } }
  if (scenario === 'household' && key === 'takenHome' && value > answers.boxMoney) return { ok: false, key: 'bh.err.takenMore', vars: { box: answers.boxMoney } }
  return { ok: true }
}

export function explainMoney(scenario: MoneyScenario, a: Record<string, number>): MoneyResult {
  for (const k of MONEY_QUESTIONS[scenario]) if (!isValidAmount(a[k])) throw new Error(`Missing or invalid ${k}`)
  const lesson = MONEY_SCENARIOS.find((s) => s.id === scenario)!.lesson
  switch (scenario) {
    case 'salesProfit': {
      const left = a.sales - a.goodsCost
      return {
        scenario,
        lesson,
        rows: [
          { key: 'sales', emoji: '🧺', amount: a.sales, kind: 'in' },
          { key: 'goodsCost', emoji: '📦', amount: a.goodsCost, kind: 'out' },
          { key: 'leftBeforeOther', emoji: '💰', amount: left, kind: 'result' },
        ],
        message: left >= 0 ? 'bh.money.salesProfit.left' : 'bh.money.salesProfit.loss',
        vars: { sales: a.sales, cost: a.goodsCost, left, loss: -left },
      }
    }
    case 'expenses': {
      const total = a.goodsCost + a.transport + a.smallCosts
      return {
        scenario,
        lesson,
        rows: [
          { key: 'goodsCost', emoji: '📦', amount: a.goodsCost, kind: 'out' },
          { key: 'transport', emoji: '🛺', amount: a.transport, kind: 'out' },
          { key: 'smallCosts', emoji: '🛍️', amount: a.smallCosts, kind: 'out' },
          { key: 'totalCost', emoji: '🧾', amount: total, kind: 'result' },
        ],
        message: a.transport + a.smallCosts === 0 ? 'bh.money.expenses.onlyGoods' : 'bh.money.expenses.total',
        vars: { goods: a.goodsCost, extra: a.transport + a.smallCosts, total },
      }
    }
    case 'credit': {
      const owed = a.sales - a.received
      return {
        scenario,
        lesson,
        rows: [
          { key: 'sales', emoji: '🧺', amount: a.sales, kind: 'in' },
          { key: 'received', emoji: '💵', amount: a.received, kind: 'in' },
          { key: 'owed', emoji: '🤝', amount: owed, kind: 'owed' },
        ],
        message: owed > 0 ? 'bh.money.credit.owed' : 'bh.money.credit.allPaid',
        vars: { sales: a.sales, received: a.received, owed },
      }
    }
    case 'household': {
      const left = a.boxMoney - a.takenHome
      return {
        scenario,
        lesson,
        rows: [
          { key: 'boxMoney', emoji: '🧰', amount: a.boxMoney, kind: 'in' },
          { key: 'takenHome', emoji: '🏠', amount: a.takenHome, kind: 'out' },
          { key: 'leftForShop', emoji: '🏪', amount: left, kind: 'result' },
        ],
        message: a.takenHome > 0 ? 'bh.money.household.taken' : 'bh.money.household.none',
        vars: { box: a.boxMoney, home: a.takenHome, left },
      }
    }
  }
}

export const isValidAmount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_AMOUNT

/** "₹1,500" with Indian digit grouping (the speech layer reads ₹ amounts as words in each language). */
export const rupees = (n: number) => (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN').format(Math.abs(n))

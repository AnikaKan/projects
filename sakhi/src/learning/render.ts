// Pure view-model builders: (content, state, business, lang) → strings and numbers for the UI.
// All amounts come from calc.ts and are formatted the same way in every language.

import type { Lang } from '../i18n/strings'
import { override } from '../i18n/overrides'
import type { Business } from '../lib/calc'
import { inr } from '../lib/calc'
import { deriveCheckValues, deriveValues } from './calc'
import { canRetry, lastAttempt } from './machine'
import type { LessonContent, LessonState, OptionOutcome, QuestionId } from './types'

type Vars = Record<string, number>

/** Resolves `key.{business}` first, then `key`. Throws on missing text so gaps are caught by tests. */
export function text(content: LessonContent, lang: Lang, business: Business, key: string, vars: Vars = {}): string {
  const dict = content.text[lang].t
  const ns = `lesson.${content.id}` as const
  let s = override(ns, lang, `${key}.${business}`) ?? override(ns, lang, key) ?? dict[`${key}.${business}`] ?? dict[key]
  if (s === undefined) throw new Error(`Missing lesson text "${key}" (${lang}, ${business})`)
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(inr(v))
  return s
}

export function hasText(content: LessonContent, lang: Lang, business: Business, key: string): boolean {
  const dict = content.text[lang].t
  return `${key}.${business}` in dict || key in dict
}

export function valuesFor(content: LessonContent, business: Business, q: QuestionId | 'example'): Vars {
  const sc = content.scenarios[business]
  if (q === 'check') return deriveCheckValues(sc.checkBefore, sc.checkAfter)
  if (q === 'practice') return deriveValues(sc.practice)
  return deriveValues(sc.example)
}

export interface RenderedOption {
  id: string
  label: string
  amount?: number
}

export function renderQuestion(content: LessonContent, q: QuestionId, business: Business, lang: Lang): { stem: string; options: RenderedOption[] } {
  const v = valuesFor(content, business, q)
  const stemKey = q === 'check' ? 'check.q' : `${q}.q`
  return {
    stem: text(content, lang, business, stemKey, v),
    options: content.questions[q].options.map((o) =>
      o.amountOf !== undefined ? { id: o.id, label: inr(v[o.amountOf]), amount: v[o.amountOf] } : { id: o.id, label: text(content, lang, business, o.labelKey!) },
    ),
  }
}

export function feedbackSuffix(outcome: OptionOutcome): string {
  if (outcome.kind === 'correct') return 'correct'
  if (outcome.kind === 'unsure') return 'unsure'
  switch (outcome.code) {
    case 'misconception_profit_adds_costs':
      return 'adds'
    case 'misconception_ignores_hidden_costs':
      return 'hidden'
    default:
      return 'revenue'
  }
}

export interface RenderedFeedback {
  tone: 'positive' | 'corrective'
  message: string
  /** Extra line shown when no attempts are left. */
  closing?: string
  canRetry: boolean
}

export function renderFeedback(content: LessonContent, state: LessonState, q: QuestionId, lang: Lang): RenderedFeedback | null {
  const last = lastAttempt(state, q)
  if (!last || state.questions[q].phase !== 'feedback') return null
  const v = valuesFor(content, state.business, q)
  const tone = last.outcome.kind === 'correct' ? 'positive' : 'corrective'
  // "Explain another way" on the response feedback swaps in an alternative explanation.
  const another = q === 'response' && tone === 'corrective' && (state.variant.feedback ?? 0) === 1
  const message = text(content, lang, state.business, another ? 'fb.response.another' : `fb.${q}.${feedbackSuffix(last.outcome)}`, v)
  const retry = canRetry(state, content, q)
  return {
    tone,
    message,
    closing: q === 'response' && tone === 'corrective' && !retry ? text(content, lang, state.business, 'fb.response.last') : undefined,
    canRetry: retry,
  }
}

export interface BarSegment {
  key: string
  label: string
  amount: number
  kind: 'goods' | 'other' | 'left' | 'profit'
}

/** Amount bars for the example step: (1) sales → goods + left, (2) sales → goods + other costs + profit. */
export function exampleBars(content: LessonContent, business: Business, lang: Lang): { sales: number; first: BarSegment[]; second: BarSegment[] } {
  const sc = content.scenarios[business].example
  const v = deriveValues(sc)
  const L = (k: string) => text(content, lang, business, k)
  const goods: BarSegment = { key: 'goods', label: L('bar.goods'), amount: v.goodsCost, kind: 'goods' }
  return {
    sales: v.sales,
    first: [goods, { key: 'left', label: L('bar.left'), amount: v.left, kind: 'left' }],
    second: [
      goods,
      ...Object.entries(sc.otherCosts).map(([k, amt]) => ({ key: k, label: L(`bar.${k}`), amount: amt, kind: 'other' as const })),
      { key: 'profit', label: L('bar.profit'), amount: v.profit, kind: 'profit' },
    ],
  }
}

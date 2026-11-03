// Approved content for the Practice step of a coaching session: one question about her own type of business,
// at her level. Numbers and correct answers come from the calculation engine (lib/calc.ts) or the approved
// item bank; nothing is generated. Wording is the app's existing (reviewed-draft) text in her language.
import { translate, type Lang, type StringKey } from '../i18n/strings'
import { PRACTICE_SCENARIOS, basicScenario, inr, practiceOptions, type Business, type Misconception } from '../lib/calc'
import type { Concept, MisconceptionCode, Outcome } from '../assessment/types'
import { ITEM_BANK } from '../assessment/bank'
import { renderQuestion } from '../assessment/engine'
import type { AnswerOutcome, CoachLevel } from '../progress/types'

export interface SessionOption {
  id: string
  label: string
  outcome: AnswerOutcome
  misconception?: MisconceptionCode
}
export interface SessionPractice {
  /** Stable id of the question within the session (stored in the answer's itemKey). */
  question: string
  concept: Concept
  text: string
  options: SessionOption[]
  /** Feedback in her language, per option id. */
  feedback: Record<string, string>
  source: 'calc' | 'itemBank'
}

const CALC_MIS: Record<Misconception, MisconceptionCode> = {
  SALES_AS_PROFIT: 'misconception_revenue_vs_profit',
  ADDS_COSTS: 'misconception_profit_adds_costs',
  IGNORES_WASTE: 'misconception_ignores_hidden_costs',
}
const HINT: Record<Misconception, StringKey> = { SALES_AS_PROFIT: 'pr.hintSales', IGNORES_WASTE: 'pr.hintWaste', ADDS_COSTS: 'pr.hintAdds' }

const fromOutcome = (o: Outcome): Pick<SessionOption, 'outcome' | 'misconception'> =>
  o.kind === 'misconception' ? { outcome: 'misconception', misconception: o.code } : { outcome: o.kind }

export function practiceFor(concept: Concept, level: CoachLevel, business: Business, lang: Lang): SessionPractice {
  const t = (k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v)
  // Sales & profit (both levels) and everyday costs (intermediate): a calculated scenario.
  if (concept === 'revenue_vs_profit' || (concept === 'business_expenses' && level === 'intermediate')) {
    const full = PRACTICE_SCENARIOS[business]
    const s = concept === 'revenue_vs_profit' && level === 'foundational' ? basicScenario(full) : full
    const opts = practiceOptions(s)
    return {
      question: `calc:${concept}:${level}`,
      concept,
      source: 'calc',
      text: s.waste ? t('pr.qApplied', { sales: inr(s.sales), stock: inr(s.stock), waste: inr(s.waste) }) : t('pr.qBasic', { sales: inr(s.sales), stock: inr(s.stock) }),
      options: opts.map((o) => ({
        id: o.id,
        label: inr(o.value),
        outcome: o.correct ? 'correct' : o.misconception ? 'misconception' : 'incorrect',
        ...(o.misconception ? { misconception: CALC_MIS[o.misconception] } : {}),
      })),
      feedback: Object.fromEntries(
        opts.map((o) => [o.id, o.correct ? t('pr.correctBody2') : o.misconception ? t(s.waste === 0 && o.misconception === 'SALES_AS_PROFIT' ? 'pr.hintSalesBasic' : HINT[o.misconception]) : t('pr.hintOther')]),
      ),
    }
  }
  // Other topics: the approved question of her level from the item bank (form A = foundational, B = intermediate).
  const item = ITEM_BANK.find((i) => i.concept === concept && i.status === 'approved' && i.form === (level === 'foundational' ? 'A' : 'B'))!
  const r = renderQuestion(item.id, business, lang)
  return {
    question: `item:${item.id}`,
    concept,
    source: 'itemBank',
    text: r.stem,
    options: r.options.map((o) => ({ id: o.id, label: o.amount !== undefined ? inr(o.amount) : o.label, ...fromOutcome(item.options.find((x) => x.id === o.id)!.outcome) })),
    feedback: Object.fromEntries(r.options.map((o) => [o.id, r.explanation])),
  }
}

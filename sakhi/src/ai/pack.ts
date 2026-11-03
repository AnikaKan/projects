// Builds the "explain pack": everything the server is allowed to tell Claude about a lesson stage,
// rendered from the approved lesson content by the same deterministic code the UI uses.
// `npm run ai:pack` writes it to server/explain/lesson-pack.json; a test keeps the two in sync.
//
// The browser never sends lesson content to the server. It sends IDs, and the server looks the content up here,
// so a modified client cannot feed the model "approved" text or amounts of its own.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import { inr } from '../lib/calc'
import { MISCONCEPTIONS, type MisconceptionCode } from '../assessment/types'
import { deriveCheckValues, deriveValues } from '../learning/calc'
import { hasText, text, valuesFor } from '../learning/render'
import type { LessonContent, LessonState, QuestionId, StepId } from '../learning/types'
import type { Stage } from './types'

export const PACK_LANGS: Lang[] = ['en', 'hi', 'te']
export const PACK_BUSINESSES: Business[] = ['vegetable', 'tea', 'grocery']
export const STAGES: Stage[] = [
  'assessment_result',
  'intro',
  'example',
  'response:asking',
  'response:feedback',
  'practice:asking',
  'practice:feedback',
  'check:asking',
  'check:feedback',
  'challenge',
]

/** Plain-language descriptions given to the model (English; the model answers in the learner's language). */
export const MISCONCEPTION_NOTES: Partial<Record<MisconceptionCode, string>> = {
  misconception_revenue_vs_profit: 'Counts all the sales money as profit.',
  misconception_profit_adds_costs: 'Adds costs to sales instead of taking them away.',
  misconception_ignores_hidden_costs: 'Takes away the cost of goods but forgets small costs like spoilage, transport, gas or bags.',
  misconception_credit_as_cash: 'Treats sales given on udhaar (credit) as cash already in the box.',
}

export function stageOf(step: StepId, phase: 'asking' | 'feedback' = 'asking'): Stage | null {
  if (step === 'complete') return null
  if (step === 'response') return 'response:asking'
  if (step === 'feedback') return 'response:feedback'
  if (step === 'practice' || step === 'check') return `${step}:${phase}`
  return step
}

export function stageFromState(s: LessonState): Stage | null {
  const q = s.step === 'practice' || s.step === 'check' ? s.step : null
  return stageOf(s.step, q ? s.questions[q].phase : 'asking')
}

export function questionOfStage(stage: Stage): QuestionId | null {
  const q = stage.split(':')[0]
  return q === 'response' || q === 'practice' || q === 'check' ? q : null
}

const isAsking = (stage: Stage) => stage.endsWith(':asking')

/** Approved text keys the model may build on at each stage. Never includes feedback (answers) while a question is open. */
const APPROVED_KEYS: Record<Stage, string[]> = {
  assessment_result: ['result.misconception', 'intro.0', 'intro.1', 'complete.rule'],
  intro: ['intro.0', 'intro.1', 'intro.2', 'complete.rule'],
  example: ['example.0', 'example.1', 'example.more', 'example.note', 'complete.rule'],
  'response:asking': ['response.q', 'intro.0', 'intro.2', 'complete.rule'],
  'response:feedback': ['response.q', 'fb.response.correct', 'fb.response.revenue', 'fb.response.adds', 'fb.response.another', 'complete.rule'],
  'practice:asking': ['practice.q', 'intro.0', 'complete.rule'],
  'practice:feedback': ['practice.q', 'fb.practice.correct', 'fb.practice.hidden', 'fb.practice.revenue', 'complete.rule'],
  'check:asking': ['check.q', 'intro.0', 'complete.rule'],
  'check:feedback': ['check.q', 'fb.check.correct', 'fb.check.revenue', 'complete.rule'],
  challenge: ['challenge', 'complete.rule'],
}

/**
 * The validated numerical example for a stage.
 * While a question is open only the amounts printed in the question are given, so neither the model
 * nor the guards can leak the computed answer.
 */
export function stageNumbers(content: LessonContent, business: Business, stage: Stage): Record<string, number> {
  const sc = content.scenarios[business]
  const q = questionOfStage(stage)
  if (q === 'check') {
    const v = deriveCheckValues(sc.checkBefore, sc.checkAfter)
    if (!isAsking(stage)) return v
    return { salesBefore: v.salesBefore, costBefore: v.costBefore, salesAfter: v.salesAfter, costAfter: v.costAfter }
  }
  const n = q === 'practice' ? sc.practice : sc.example
  const v = deriveValues(n)
  if (isAsking(stage)) return { sales: n.sales, goodsCost: n.goodsCost, ...n.otherCosts }
  // Drop distractor-only and zero values from the "true facts" given to the model.
  const { salesPlusGoods: _d, ...facts } = v
  void _d
  // No udhaar in this scenario → credit/cash-in-box add nothing but noise.
  if (!v.credit) {
    const { credit: _c, cashInBox: _b, ...rest } = facts
    void _c
    void _b
    return rest
  }
  return facts
}

/** Amounts generated text may contain at this stage (validated facts + amounts shown as answer choices). */
export function allowedAmounts(content: LessonContent, business: Business, stage: Stage): number[] {
  // A change like "profit fell by ₹50" is stored as −50; allow the size of the change too.
  const set = new Set(Object.values(stageNumbers(content, business, stage)).flatMap((x) => [x, Math.abs(x)]))
  const q = questionOfStage(stage)
  if (q) {
    const v = valuesFor(content, business, q)
    for (const o of content.questions[q].options) if (o.amountOf) set.add(v[o.amountOf])
  }
  return [...set].sort((a, b) => a - b)
}

/**
 * While a question is open, generated text may list the answer choices but must not single out the right one.
 * Returns the correct amount and the other amount choices, or null if the question has no amount choices.
 */
export function revealRule(content: LessonContent, business: Business, stage: Stage): { correct: number; others: number[] } | null {
  const q = questionOfStage(stage)
  if (!q || !isAsking(stage)) return null
  const v = valuesFor(content, business, q)
  const amountOpts = content.questions[q].options.filter((o) => o.amountOf)
  const correct = amountOpts.find((o) => o.outcome.kind === 'correct')
  if (!correct) return null
  return { correct: v[correct.amountOf!], others: amountOpts.filter((o) => o !== correct).map((o) => v[o.amountOf!]) }
}

function renderStageText(content: LessonContent, lang: Lang, business: Business, stage: Stage): string[] {
  const vars = stageVars(content, business, stage)
  return APPROVED_KEYS[stage].filter((k) => hasText(content, lang, business, k)).map((k) => text(content, lang, business, k, vars))
}

/** Slot values for rendering approved text at a stage (full values: question stems only use their own slots). */
function stageVars(content: LessonContent, business: Business, stage: Stage): Record<string, number> {
  const q = questionOfStage(stage)
  return valuesFor(content, business, q ?? 'example')
}

export interface PackStage {
  allowed: number[]
  example: Record<string, number>
  approved: Record<Lang, string[]>
  reveal: { correct: number; others: number[] } | null
  question: null | {
    id: QuestionId
    stem: Record<Lang, string>
    options: { id: string; label: Record<Lang, string> }[]
    /** Only present once the learner has answered (feedback stages). */
    correctOptionId: string | null
  }
}

export interface ExplainPack {
  schemaVersion: 1
  lessonId: string
  contentVersion: string
  contentStatus: 'approved' | 'draft'
  conceptId: string
  conceptName: Record<Lang, string>
  misconceptions: Record<string, string>
  /** Every code the request may carry (from the assessment taxonomy). */
  misconceptionCodes: string[]
  questions: Record<QuestionId, { maxAttempts: number; options: { id: string; outcome: string; misconception: string | null }[] }>
  stages: Record<Business, Record<Stage, PackStage>>
}

export function buildExplainPack(content: LessonContent): ExplainPack {
  const per = <T,>(f: (lang: Lang) => T) => Object.fromEntries(PACK_LANGS.map((l) => [l, f(l)])) as Record<Lang, T>
  const stages = {} as Record<Business, Record<Stage, PackStage>>
  for (const b of PACK_BUSINESSES) {
    stages[b] = {} as Record<Stage, PackStage>
    for (const stage of STAGES) {
      const q = questionOfStage(stage)
      let question: PackStage['question'] = null
      if (q) {
        const v = valuesFor(content, b, q)
        const spec = content.questions[q]
        question = {
          id: q,
          stem: per((l) => text(content, l, b, q === 'check' ? 'check.q' : `${q}.q`, v)),
          options: spec.options.map((o) => ({
            id: o.id,
            label: per((l) => (o.amountOf ? inr(v[o.amountOf]) : text(content, l, b, o.labelKey!))),
          })),
          correctOptionId: isAsking(stage) ? null : spec.options.find((o) => o.outcome.kind === 'correct')!.id,
        }
      }
      stages[b][stage] = {
        allowed: allowedAmounts(content, b, stage),
        example: stageNumbers(content, b, stage),
        approved: per((l) => renderStageText(content, l, b, stage)),
        reveal: revealRule(content, b, stage),
        question,
      }
    }
  }
  return {
    schemaVersion: 1,
    lessonId: content.id,
    contentVersion: content.version,
    contentStatus: content.status,
    conceptId: content.id,
    conceptName: per((l) => content.text[l].title),
    misconceptions: MISCONCEPTION_NOTES as Record<string, string>,
    misconceptionCodes: [...MISCONCEPTIONS],
    questions: Object.fromEntries(
      (Object.keys(content.questions) as QuestionId[]).map((q) => [
        q,
        {
          maxAttempts: content.questions[q].maxAttempts,
          options: content.questions[q].options.map((o) => ({ id: o.id, outcome: o.outcome.kind, misconception: o.outcome.kind === 'misconception' ? o.outcome.code : null })),
        },
      ]),
    ) as ExplainPack['questions'],
    stages,
  }
}

// Runtime schema for the evaluation dataset (tests/evals/dataset/*.json).
import { z } from 'zod'

export const LANGS = ['en', 'hi', 'te'] as const
export const BUSINESSES = ['vegetable', 'tea', 'grocery'] as const
export const CONCEPTS = ['revenue_vs_profit', 'business_expenses', 'customer_credit', 'business_household_separation', 'savings_cash_management'] as const
export const CATEGORIES = [
  'correct',
  'misconception',
  'ambiguous',
  'misheard_amount',
  'code_mixed_te_en',
  'code_mixed_hi_en',
  'repeat_request',
  'unrelated',
  'leave_curriculum',
] as const
export const ROUTES = ['score', 'propose_confirm', 'no_match_prompt', 'ai_interpret', 'redirect_advice', 'redirect_private', 'replay'] as const
export const CRITICAL = [
  'SCORED_NON_ANSWER',
  'FALSE_CORRECT',
  'WRONG_CORRECTNESS_ON_CORRECT',
  'MISCONCEPTION_MISSED',
  'PROPOSED_WRONG_AMOUNT',
  'MISHEARD_AUTO_SCORED',
  'ILLEGAL_PROGRESSION',
  'PRIVATE_DATA_SENT',
  'ADVICE_NOT_REDIRECTED',
] as const
/** Labels only an AI layer (or a future intent detector) can assign. */
export const AI_LABELS = ['clarification_request', 'unrelated', 'leave_curriculum'] as const

const Context = z.discriminatedUnion('surface', [
  z.object({ surface: z.literal('assessment'), itemId: z.string(), attempt: z.number().int().min(1).max(4) }).strict(),
  z
    .object({
      surface: z.literal('lesson'),
      lessonId: z.literal('revenue_vs_profit'),
      question: z.enum(['response', 'practice', 'check']),
      priorAnswers: z.array(z.string()).max(1).optional(),
    })
    .strict(),
])

export const CaseSchema = z
  .object({
    id: z.string().regex(/^[A-Z]{3}-(EN|HI|TE)-\d{2}$/),
    language: z.enum(LANGS),
    business: z.enum(BUSINESSES),
    concept: z.enum(CONCEPTS),
    category: z.enum(CATEGORIES),
    context: Context,
    input: z
      .object({
        mode: z.enum(['tap', 'speech', 'text']),
        value: z.string().min(1).max(300),
        /** For misheard cases: the amount the learner actually said (STT produced `value`). */
        intendedAmount: z.number().int().positive().optional(),
      })
      .strict(),
    expected: z
      .object({
        classification: z.union([z.string(), z.array(z.string()).min(1)]),
        correctness: z.enum(['correct', 'incorrect', 'unsure', 'not_scored']),
        nextAction: z.string(),
        routes: z.array(z.enum(ROUTES)).min(1),
        amount: z.number().int().positive().optional(),
        optionId: z.string().optional(),
      })
      .strict(),
    critical: z.array(z.enum(CRITICAL)),
    consistencyGroup: z.string().optional(),
    translation: z.object({ status: z.enum(['needs_native_review', 'reviewed']), confidence: z.enum(['low', 'medium', 'high']), reviewer: z.string().optional() }).strict().optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.id.split('-')[1].toLowerCase() !== c.language) ctx.addIssue({ code: 'custom', message: 'id language tag must match language' })
    if (c.language !== 'en' && !c.translation) ctx.addIssue({ code: 'custom', message: 'non-English inputs need a translation review status' })
    if (c.translation?.status === 'reviewed' && !c.translation.reviewer) ctx.addIssue({ code: 'custom', message: '"reviewed" requires a named reviewer' })
  })

export const DatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    name: z.string(),
    version: z.string(),
    createdAt: z.string(),
    description: z.string(),
    cases: z.array(CaseSchema).min(1),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = d.cases.map((c) => c.id)
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'duplicate case ids' })
  })

export type EvalCase = z.infer<typeof CaseSchema>
export type Dataset = z.infer<typeof DatasetSchema>

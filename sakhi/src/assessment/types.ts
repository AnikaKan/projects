// Typed schemas for the diagnostic assessment.
// Everything here is deterministic content and logic. Nothing in this folder calls an AI model.

import type { Business } from '../lib/calc'
import type { Lang } from '../i18n/strings'

export const CONCEPTS = [
  'revenue_vs_profit',
  'business_expenses',
  'customer_credit',
  'business_household_separation',
  'savings_cash_management',
] as const
/** Question order and tie-break order, as listed in the assessment brief. (Module numbers live in LESSON_CATALOG.) */
export type Concept = (typeof CONCEPTS)[number]

/** Lesson IDs are 1:1 with concepts in the MVP curriculum. */
export type LessonId = Concept

export const MISCONCEPTIONS = [
  'misconception_revenue_vs_profit', // counts all sales money as profit
  'misconception_profit_adds_costs', // adds costs to sales instead of subtracting
  'misconception_household_as_business_expense', // counts household spending as a business cost
  'misconception_ignores_hidden_costs', // leaves out transport and other small costs
  'misconception_credit_as_cash', // treats udhaar as cash already received
  'misconception_spends_working_capital', // spends money needed for tomorrow's stock
  'misconception_savings_mixed_with_cash', // keeps savings mixed with the shop cash
  'misconception_mixes_business_household', // takes home money from the cash box without separating it
] as const
export type MisconceptionCode = (typeof MISCONCEPTIONS)[number]

export type UnderstandsCode = `understands_${Concept}`
export type UnsureCode = `unsure_${Concept}`
export type Classification = UnderstandsCode | UnsureCode | MisconceptionCode

export type Outcome = { kind: 'correct' } | { kind: 'misconception'; code: MisconceptionCode } | { kind: 'unsure' }

export type ItemKind = 'yes_no' | 'single_choice' | 'amount_choice'

/** Integer rupee amounts for one business variant. Fictional values only. */
export type Params = Record<string, number>

export interface OptionSpec {
  id: string
  /** i18n key for a text label (yes_no / single_choice). Business-specific keys may use {business}. */
  labelKey?: string
  /** For amount_choice: name of the derived value shown as the option. */
  amountOf?: string
  outcome: Outcome
}

export interface ItemSpec {
  id: string
  concept: Concept
  /** Parallel forms: A is used on odd attempts, B on even attempts, so a retry asks different questions. */
  form: 'A' | 'B'
  kind: ItemKind
  /** Only approved items are ever served. */
  status: 'approved' | 'draft'
  contentVersion: string
  stemKey: string
  explanationKey: string
  params: Record<Business, Params>
  /** Deterministic derived values (e.g. profit). Same function for every language. */
  derive: (p: Params) => Params
  options: OptionSpec[]
}

/** A question rendered for one business and language. Holds no state. */
export interface RenderedQuestion {
  itemId: string
  concept: Concept
  kind: ItemKind
  stem: string
  options: { id: string; label: string; amount?: number }[]
  explanation: string
  /** All amounts used in the question (input + derived), for display and audit. */
  values: Params
}

export type AnswerSource = 'tap' | 'voice'

export interface AnswerInput {
  itemId: string
  optionId: string
  source: AnswerSource
  /** Language the learner saw when answering (audit only; never used for scoring). */
  lang: Lang
  voice?: { transcript: string; confidence: number }
  answeredAt: string
}

export type NextAction = 'continue_assessment' | 'complete_assessment'

export interface ScoredAnswer extends AnswerInput {
  concept: Concept
  outcome: Outcome
  classification: Classification
  /** Set when the answer shows a misconception: the lesson that addresses it. */
  provisionalLesson?: LessonId
}

/** Two diagnostic tiers (docs/DIAGNOSTIC_STRATEGY.md). Item form A = foundational, form B = intermediate (applied). */
export type Tier = 'foundational' | 'intermediate'

/**
 * staged  = start with 5 foundational questions; if she shows understanding, unlock up to 3 intermediate ones.
 * applied = a later re-check with the 5 intermediate (applied) questions.
 */
export type AssessmentMode = 'staged' | 'applied'

export interface AssessmentSession {
  schemaVersion: 1
  id: string
  learnerId: string
  business: Business
  attempt: number
  /** Optional for records saved before tiers existed (treated as 'applied' on even attempts, else 'staged'). */
  mode?: AssessmentMode
  /** Staged mode: set once the foundational round is scored. */
  gate?: { passed: boolean; correct: number; of: number }
  itemIds: string[]
  answers: ScoredAnswer[]
  startedAt: string
  updatedAt: string
}

/** What one assessment can tell us about a concept. There is deliberately no "mastered" level. */
export type ConceptLevel = 'not_assessed' | 'gap' | 'unsure' | 'emerging' | 'consistent'

export type RecommendationReason = 'misconception' | 'applied_gap' | 'unsure' | 'not_assessed' | 'next_in_path'

export interface Recommendation {
  lessonId: LessonId
  concept: Concept
  reason: RecommendationReason
  misconceptions: MisconceptionCode[]
  /** Other concepts worth reviewing, highest priority first. */
  alsoReview: Concept[]
}

export interface AssessmentResult {
  schemaVersion: 1
  sessionId: string
  learnerId: string
  business: Business
  attempt: number
  answers: ScoredAnswer[]
  conceptLevels: Record<Concept, ConceptLevel>
  misconceptions: MisconceptionCode[]
  recommendation: Recommendation
  /** Learner's current level from this diagnostic (optional on records saved before tiers existed). */
  tier?: Tier
  /** Up to two misconceptions to work on, most important first (MVP order, then severity). */
  mainMisconceptions?: MisconceptionCode[]
  completedAt: string
}

export interface LessonEntry {
  id: LessonId
  concept: Concept
  moduleId: 'm1' | 'm2' | 'm3' | 'm4' | 'm5'
  status: 'approved' | 'draft'
  contentVersion: string
}

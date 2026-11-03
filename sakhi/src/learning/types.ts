// Typed model for the personalised lesson experience.
// Content (text, numbers) lives in ./content; behaviour lives in ./machine. Components only render.

import type { Business } from '../lib/calc'
import type { Lang } from '../i18n/strings'
import type { MisconceptionCode, LessonId } from '../assessment/types'

/** The nine states of the learning state machine, in order. */
export const STEPS = [
  'assessment_result',
  'intro',
  'example',
  'response',
  'feedback',
  'practice',
  'check',
  'challenge',
  'complete',
] as const
export type StepId = (typeof STEPS)[number]

export type QuestionId = 'response' | 'practice' | 'check'

/** Outcome of choosing an option. Misconception codes reuse the assessment taxonomy. */
export type OptionOutcome = { kind: 'correct' } | { kind: 'misconception'; code: MisconceptionCode } | { kind: 'unsure' }

// ── Content schema (language-free numbers + per-language text) ─────────────

/** Integer rupee amounts for one business. */
export interface ScenarioNumbers {
  sales: number
  /** Cost of the goods that were sold (vegetables from the mandi, milk + tea leaves + sugar, stock). */
  goodsCost: number
  /** Other business costs for the same day, keyed by a content label id. */
  otherCosts: Record<string, number>
  /** Part of sales given on udhaar (still counts as a sale; not yet cash in the box). */
  creditSales?: number
}

export interface QuestionSpec {
  id: QuestionId
  /** Which scenario's numbers the question uses. */
  scenario: 'example' | 'practice' | 'checkBefore' | 'checkAfter'
  options: {
    id: string
    /** Show a computed amount (key from deriveValues) … */
    amountOf?: string
    /** … or a text label key from the lesson text. */
    labelKey?: string
    outcome: OptionOutcome
  }[]
  /** Answers allowed before moving on (comprehension check = 1). */
  maxAttempts: number
}

export interface LessonText {
  title: string
  stepLabels: Record<StepId, string>
  ui: Record<string, string>
  /** Learner-facing strings. Keys with `.{business}` variants are resolved per business. Values may contain {slots}. */
  t: Record<string, string>
}

export interface LessonContent {
  id: LessonId
  version: string
  status: 'approved' | 'draft'
  scenarios: Record<Business, { example: ScenarioNumbers; practice: ScenarioNumbers; checkBefore: ScenarioNumbers; checkAfter: ScenarioNumbers }>
  questions: Record<QuestionId, QuestionSpec>
  /** Number of "explain another way" variants for each explainable step. */
  explainVariants: Partial<Record<StepId, number>>
  text: Record<Lang, LessonText>
}

// ── Runtime state ─────────────────────────────────────────────────────

export interface Attempt {
  optionId: string
  outcome: OptionOutcome
  at: string
}

export interface QuestionState {
  attempts: Attempt[]
  phase: 'asking' | 'feedback'
}

export type LessonResult = 'understood' | 'developing' | 'needs_review'

export interface LessonState {
  schemaVersion: 1
  lessonId: LessonId
  business: Business
  step: StepId
  questions: Record<QuestionId, QuestionState>
  /** Which explanation variant is showing on each explainable step. */
  variant: Partial<Record<StepId, number>>
  repeats: number
  anotherWay: number
  /** Misconceptions carried in from the assessment (shown on the first step). */
  fromAssessment: MisconceptionCode[]
  challengeAccepted: boolean | null
  startedAt: string
  updatedAt: string
  completedAt: string | null
  result: LessonResult | null
}

export type LessonEvent =
  | { type: 'NEXT' }
  | { type: 'ANSWER'; optionId: string }
  | { type: 'RETRY' }
  | { type: 'REPEAT' }
  | { type: 'EXPLAIN_ANOTHER_WAY' }
  | { type: 'ACCEPT_CHALLENGE' }
  | { type: 'NOT_NOW' }

export interface MisconceptionSummary {
  observed: MisconceptionCode[]
  /** Observed earlier but followed by a correct answer later in the lesson. */
  resolved: MisconceptionCode[]
  /** Still present at the end of the lesson. */
  open: MisconceptionCode[]
}

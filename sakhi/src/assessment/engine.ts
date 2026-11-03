// Deterministic assessment engine: assembly, rendering, scoring, concept levels and recommendation.
// Pure functions only. Language affects rendered text, never scoring.

import type { Business } from '../lib/calc'
import { inr } from '../lib/calc'
import type { Lang } from '../i18n/strings'
import { ITEM_BANK, ITEMS_BY_ID, LESSON_CATALOG, MISCONCEPTION_TAXONOMY } from './bank'
import { at } from './i18n'
import {
  CONCEPTS,
  type AnswerInput,
  type AssessmentResult,
  type AssessmentSession,
  type Classification,
  type Concept,
  type ConceptLevel,
  type ItemSpec,
  type LessonEntry,
  type MisconceptionCode,
  type NextAction,
  type Outcome,
  type Recommendation,
  type RecommendationReason,
  type RenderedQuestion,
  type ScoredAnswer,
  type AssessmentMode,
  type Tier,
} from './types'

export const MIN_QUESTIONS = 3
export const MAX_QUESTIONS = 5

/**
 * MVP lesson order (docs/MVP_LESSON_PRIORITIZATION.md): the first three are the MVP core taught in the app;
 * customer credit and daily saving come later. Used to order recommendations and intermediate questions.
 */
export const MVP_SEQUENCE: Concept[] = ['revenue_vs_profit', 'business_expenses', 'business_household_separation', 'customer_credit', 'savings_cash_management']
export const MVP_CORE: Concept[] = MVP_SEQUENCE.slice(0, 3)

/**
 * Foundational → intermediate gate (docs/DIAGNOSTIC_STRATEGY.md): at least 4 of the 5 foundational answers
 * correct, AND the anchor concept (sales vs profit) correct. Everything builds on that one.
 */
export const TIER_GATE = { minCorrect: 4, anchor: 'revenue_vs_profit' as Concept }
/** At most this many intermediate questions are added, so a full diagnostic stays at ≤ 8 questions. */
export const MAX_INTERMEDIATE = 3

export const tierOfItem = (item: ItemSpec): Tier => (item.form === 'A' ? 'foundational' : 'intermediate')

/** Short-on-time assessments keep the three foundation concepts. */
const PRIORITY_FOR_SHORT: Concept[] = ['revenue_vs_profit', 'customer_credit', 'business_household_separation', 'business_expenses', 'savings_cash_management']

// ── Assembly ─────────────────────────────────────────────────────────

export function formForAttempt(attempt: number): 'A' | 'B' {
  return attempt % 2 === 1 ? 'A' : 'B'
}

/** Picks one approved item per concept, in curriculum order. Attempt 2 uses parallel form B. */
export function selectItems(attempt: number, length: number = MAX_QUESTIONS, bank: ItemSpec[] = ITEM_BANK): string[] {
  if (!Number.isInteger(length) || length < MIN_QUESTIONS || length > MAX_QUESTIONS) {
    throw new RangeError(`Assessment length must be ${MIN_QUESTIONS}–${MAX_QUESTIONS}`)
  }
  const chosen = new Set(PRIORITY_FOR_SHORT.slice(0, length))
  const form = formForAttempt(attempt)
  const ids: string[] = []
  for (const c of CONCEPTS) {
    if (!chosen.has(c)) continue
    const approved = bank.filter((i) => i.concept === c && i.status === 'approved')
    const item = approved.find((i) => i.form === form) ?? approved[0]
    if (item) ids.push(item.id)
  }
  return ids
}

/** Default mode: staged on odd attempts (first diagnostic), applied re-check on even attempts. */
export function defaultMode(attempt: number): AssessmentMode {
  return formForAttempt(attempt) === 'A' ? 'staged' : 'applied'
}

export function startAssessment(opts: {
  learnerId: string
  business: Business
  attempt: number
  length?: number
  now: string
  id?: string
  /** A retake can be chosen by the learner's last tier (see useAssessment). */
  mode?: AssessmentMode
}): AssessmentSession {
  const mode = opts.mode ?? defaultMode(opts.attempt)
  return {
    schemaVersion: 1,
    id: opts.id ?? `asmt_${opts.learnerId}_${opts.attempt}_${opts.now}`,
    learnerId: opts.learnerId,
    business: opts.business,
    attempt: opts.attempt,
    mode,
    itemIds: selectItems(mode === 'staged' ? 1 : 2, opts.length ?? MAX_QUESTIONS),
    answers: [],
    startedAt: opts.now,
    updatedAt: opts.now,
  }
}

// ── Rendering ────────────────────────────────────────────────────────

export function itemValues(item: ItemSpec, business: Business): Record<string, number> {
  const p = item.params[business]
  return { ...p, ...item.derive(p) }
}

export function renderQuestion(itemId: string, business: Business, lang: Lang): RenderedQuestion {
  const item = ITEMS_BY_ID[itemId]
  if (!item) throw new Error(`Unknown item ${itemId}`)
  const values = itemValues(item, business)
  const vars: Record<string, string> = { goods: at(lang, `goods.${business}`) }
  for (const [k, v] of Object.entries(values)) vars[k] = inr(v)
  return {
    itemId,
    concept: item.concept,
    kind: item.kind,
    stem: at(lang, item.stemKey, vars),
    options: item.options.map((o) =>
      o.amountOf
        ? { id: o.id, label: inr(values[o.amountOf]), amount: values[o.amountOf] }
        : { id: o.id, label: at(lang, o.labelKey!.replace('{business}', business)) },
    ),
    explanation: at(lang, item.explanationKey, vars),
    values,
  }
}

// ── Scoring ──────────────────────────────────────────────────────────

export function classify(concept: Concept, outcome: Outcome): Classification {
  if (outcome.kind === 'correct') return `understands_${concept}`
  if (outcome.kind === 'unsure') return `unsure_${concept}`
  return outcome.code
}

/** Scores one answer by option id. Language and answer source have no effect. */
export function scoreAnswer(itemId: string, optionId: string): { concept: Concept; outcome: Outcome; classification: Classification; provisionalLesson?: LessonEntry['id'] } {
  const item = ITEMS_BY_ID[itemId]
  if (!item) throw new Error(`Unknown item ${itemId}`)
  const opt = item.options.find((o) => o.id === optionId)
  if (!opt) throw new Error(`Unknown option ${optionId} for ${itemId}`)
  const classification = classify(item.concept, opt.outcome)
  const base = { concept: item.concept, outcome: opt.outcome, classification }
  return opt.outcome.kind === 'misconception' ? { ...base, provisionalLesson: MISCONCEPTION_TAXONOMY[opt.outcome.code].lesson } : base
}

export function currentItemId(s: AssessmentSession): string | null {
  return s.itemIds[s.answers.length] ?? null
}

export function isComplete(s: AssessmentSession): boolean {
  return s.answers.length >= s.itemIds.length
}

/** Scores the foundational round of a staged diagnostic. */
export function scoreGate(foundational: ScoredAnswer[]): { passed: boolean; correct: number; of: number } {
  const correct = foundational.filter((a) => a.outcome.kind === 'correct').length
  const anchorOk = foundational.some((a) => a.concept === TIER_GATE.anchor && a.outcome.kind === 'correct')
  return { passed: correct >= TIER_GATE.minCorrect && anchorOk, correct, of: foundational.length }
}

/** Intermediate questions to add after a passed gate: MVP-core concepts she answered correctly, in MVP order. */
export function intermediateItemsFor(foundational: ScoredAnswer[], bank: ItemSpec[] = ITEM_BANK): string[] {
  const ok = new Set(foundational.filter((a) => a.outcome.kind === 'correct').map((a) => a.concept))
  return MVP_CORE.filter((c) => ok.has(c))
    .map((c) => bank.find((i) => i.concept === c && i.status === 'approved' && i.form === 'B')?.id)
    .filter((id): id is string => !!id)
    .slice(0, MAX_INTERMEDIATE)
}

/**
 * Records the answer to the current question. Answers are locked once submitted.
 * Staged mode: when the last foundational answer is in, the gate is scored. If it is passed, intermediate
 * questions are appended and the diagnostic continues (`tierUnlocked`); otherwise it is complete.
 */
export function submitAnswer(s: AssessmentSession, input: AnswerInput): { session: AssessmentSession; scored: ScoredAnswer; nextAction: NextAction; tierUnlocked?: boolean } {
  const expected = currentItemId(s)
  if (expected === null) throw new Error('Assessment already complete')
  if (input.itemId !== expected) throw new Error(`Expected answer for ${expected}, got ${input.itemId}`)
  const scored: ScoredAnswer = { ...input, ...scoreAnswer(input.itemId, input.optionId) }
  let session: AssessmentSession = { ...s, answers: [...s.answers, scored], updatedAt: input.answeredAt }
  let tierUnlocked = false
  if ((s.mode ?? defaultMode(s.attempt)) === 'staged' && !session.gate && isComplete(session)) {
    const gate = scoreGate(session.answers)
    const extra = gate.passed ? intermediateItemsFor(session.answers) : []
    session = { ...session, gate, itemIds: [...session.itemIds, ...extra] }
    tierUnlocked = extra.length > 0
  }
  return { session, scored, nextAction: isComplete(session) ? 'complete_assessment' : 'continue_assessment', ...(tierUnlocked ? { tierUnlocked } : {}) }
}

// ── Concept levels ───────────────────────────────────────────────────

/**
 * Combines evidence from all completed attempts (oldest first) plus the current answers.
 * - latest answer misconception → gap; unsure → unsure
 * - latest correct → emerging
 * - consistent only with ≥2 correct answers on DIFFERENT items and no misconception in the latest two
 * One correct response never produces more than "emerging".
 */
export function conceptLevels(answerHistory: ScoredAnswer[]): Record<Concept, ConceptLevel> {
  const out = Object.fromEntries(CONCEPTS.map((c) => [c, 'not_assessed'])) as Record<Concept, ConceptLevel>
  for (const c of CONCEPTS) {
    const ev = answerHistory.filter((a) => a.concept === c)
    if (!ev.length) continue
    const last = ev[ev.length - 1]
    if (last.outcome.kind === 'misconception') out[c] = 'gap'
    else if (last.outcome.kind === 'unsure') out[c] = 'unsure'
    else {
      const correctItems = new Set(ev.filter((a) => a.outcome.kind === 'correct').map((a) => a.itemId))
      const lastTwo = ev.slice(-2)
      const lastTwoClean = lastTwo.length === 2 && lastTwo.every((a) => a.outcome.kind === 'correct')
      out[c] = correctItems.size >= 2 && lastTwoClean ? 'consistent' : 'emerging'
    }
  }
  return out
}

// ── Recommendation ───────────────────────────────────────────────────

/**
 * Recommendation (docs/DIAGNOSTIC_STRATEGY.md §4), in MVP order (MVP_SEQUENCE):
 *   1. a concept with a misconception on a FOUNDATIONAL question          → reason 'misconception'
 *   2. a concept she was unsure about                                       → 'unsure'
 *   3. a concept right at foundational but missed at INTERMEDIATE (applied) → 'applied_gap'
 *   4. a concept not asked (short diagnostic)                               → 'not_assessed'
 *   5. otherwise the first lesson in MVP order she has not completed         → 'next_in_path'
 * `answers` lets rule 1 and 3 be told apart; without them every gap counts as rule 1.
 */
export function recommend(
  levels: Record<Concept, ConceptLevel>,
  misconceptions: MisconceptionCode[],
  opts: { completedLessons?: string[]; catalog?: LessonEntry[]; answers?: ScoredAnswer[] } = {},
): Recommendation {
  const catalog = opts.catalog ?? LESSON_CATALOG
  const completed = new Set(opts.completedLessons ?? [])
  const approved = (c: Concept) => catalog.find((l) => l.concept === c && l.status === 'approved')
  const order = MVP_SEQUENCE.filter((c) => approved(c))
  if (!order.length) throw new Error('No approved lessons in catalog')
  const answers = opts.answers ?? []
  const appliedOnly = (c: Concept) => {
    const ev = answers.filter((a) => a.concept === c)
    const foundationalMiss = ev.some((a) => tierOfItem(ITEMS_BY_ID[a.itemId]) === 'foundational' && a.outcome.kind === 'misconception')
    const appliedMiss = ev.some((a) => tierOfItem(ITEMS_BY_ID[a.itemId]) === 'intermediate' && a.outcome.kind === 'misconception')
    const foundationalAsked = ev.some((a) => tierOfItem(ITEMS_BY_ID[a.itemId]) === 'foundational')
    return appliedMiss && !foundationalMiss && foundationalAsked
  }
  const rank = (c: Concept): number | null => {
    const l = levels[c]
    if (l === 'gap') return appliedOnly(c) ? 2 : 0
    if (l === 'unsure') return 1
    if (l === 'not_assessed') return 3
    return null
  }
  const needsWork = order.filter((c) => rank(c) !== null).sort((a, b) => rank(a)! - rank(b)! || order.indexOf(a) - order.indexOf(b))
  let concept: Concept
  let reason: RecommendationReason
  if (needsWork.length) {
    concept = needsWork[0]
    reason = (['misconception', 'unsure', 'applied_gap', 'not_assessed'] as const)[rank(concept)!]
  } else {
    concept = order.find((c) => !completed.has(approved(c)!.id)) ?? order[0]
    reason = 'next_in_path'
  }
  return {
    lessonId: approved(concept)!.id,
    concept,
    reason,
    misconceptions: misconceptions.filter((m) => MISCONCEPTION_TAXONOMY[m].concept === concept),
    alsoReview: needsWork.filter((c) => c !== concept),
  }
}

/** Learner's level from one diagnostic. Staged: the gate. Applied re-check: ≥3 of 5 applied answers correct. */
export function tierFor(s: AssessmentSession): Tier {
  if ((s.mode ?? defaultMode(s.attempt)) === 'staged') return s.gate?.passed ? 'intermediate' : 'foundational'
  return s.answers.filter((a) => a.outcome.kind === 'correct').length >= 3 ? 'intermediate' : 'foundational'
}

/**
 * Up to two misconceptions to work on, in the same priority as the recommendation:
 * misconceptions seen on FOUNDATIONAL questions first, then applied ones; MVP order, then severity.
 */
export function mainMisconceptions(codes: MisconceptionCode[], answers: ScoredAnswer[] = []): MisconceptionCode[] {
  const foundational = (m: MisconceptionCode) =>
    answers.some((a) => a.outcome.kind === 'misconception' && a.outcome.code === m && tierOfItem(ITEMS_BY_ID[a.itemId]) === 'foundational') || !answers.length
  return [...codes]
    .sort(
      (a, b) =>
        Number(foundational(b)) - Number(foundational(a)) ||
        MVP_SEQUENCE.indexOf(MISCONCEPTION_TAXONOMY[a].concept) - MVP_SEQUENCE.indexOf(MISCONCEPTION_TAXONOMY[b].concept) ||
        MISCONCEPTION_TAXONOMY[b].severity - MISCONCEPTION_TAXONOMY[a].severity,
    )
    .slice(0, 2)
}

export function finalize(
  s: AssessmentSession,
  opts: { now: string; previousResults?: AssessmentResult[]; completedLessons?: string[] },
): AssessmentResult {
  if (!isComplete(s)) throw new Error('Cannot finalize an incomplete assessment')
  const history = [...(opts.previousResults ?? [])].filter((r) => r.learnerId === s.learnerId).sort((a, b) => a.attempt - b.attempt)
  const allAnswers = [...history.flatMap((r) => r.answers), ...s.answers]
  const levels = conceptLevels(allAnswers)
  const misconceptions = [...new Set(s.answers.flatMap((a) => (a.outcome.kind === 'misconception' ? [a.outcome.code] : [])))]
  return {
    schemaVersion: 1,
    sessionId: s.id,
    learnerId: s.learnerId,
    business: s.business,
    attempt: s.attempt,
    answers: s.answers,
    conceptLevels: levels,
    misconceptions,
    recommendation: recommend(levels, misconceptions, { completedLessons: opts.completedLessons, answers: s.answers }),
    tier: tierFor(s),
    mainMisconceptions: mainMisconceptions(misconceptions, s.answers),
    completedAt: opts.now,
  }
}

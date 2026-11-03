// Runs one learner turn through the REAL deterministic pipeline of the app, exactly as the screens compose it:
//   every answer screen: VoiceAnswer → interpretUtterance (sensitive / advice / clarification / leave / unsure /
//                        answer / ambiguous amount / unrelated) → (learner confirms an answer)
//   assessment:          → submitAnswer / finalize
//   lesson:              → lesson machine → renderFeedback; safe non-answers → explain client → /api/explain or approved fallback
// Nothing here re-implements scoring, parsing or progression: it only calls the app's own modules.
import { finalize, renderQuestion as renderItem, scoreAnswer, startAssessment, submitAnswer } from '../../../src/assessment/engine'
import { ITEMS_BY_ID } from '../../../src/assessment/bank'
import { at } from '../../../src/assessment/i18n'
import { translate } from '../../../src/i18n/strings'
import type { MatchableOption } from '../../../src/speech/answerMatching'
import { parseSpokenAmounts } from '../../../src/speech/numbers'
import { interpretUtterance, type UtteranceIntent } from '../../../src/speech/intent'
import { inr } from '../../../src/lib/calc'
import { REVENUE_VS_PROFIT as RVP } from '../../../src/learning/content/revenueVsProfit'
import { canAdvance, canRetry, initialState, replay, transition } from '../../../src/learning/machine'
import { renderFeedback, renderQuestion as renderLessonQuestion, valuesFor } from '../../../src/learning/render'
import type { LessonEvent, LessonState, QuestionId } from '../../../src/learning/types'
import { approvedFallback } from '../../../src/ai/fallback'
import { allowedAmounts, stageFromState } from '../../../src/ai/pack'
import type { AiResponse } from '../../../src/ai/types'
import type { EvalCase } from './schema'

export type Route = 'score' | 'propose_confirm' | 'no_match_prompt' | 'ai_interpret' | 'redirect_advice' | 'redirect_private' | 'replay'

export interface SystemResult {
  route: Route
  optionId?: string
  /** Amount the parser read from the words (amount questions only). */
  parsedAmount?: number | null
  proposedAmount?: number
  matchReason?: string
  classification: string
  correctness: 'correct' | 'incorrect' | 'unsure' | 'not_scored'
  nextAction: string
  /** Would the learner's words leave the device for the AI endpoint (when a key is configured)? */
  sentToModel: boolean
  /** What the learner sees/hears next, as an AiResponse-shaped object (approved content, no model call). */
  response: AiResponse
  responseSource: 'assessment_feedback' | 'lesson_feedback' | 'no_match_prompt' | 'approved_fallback'
  /** Amounts the learner-facing text may contain (validated values for this question). */
  allowed: number[]
  /** Correct option's amount, if the question has amount options. */
  correctAmount?: number
}

const N: LessonEvent = { type: 'NEXT' }
const PREFIX: Record<QuestionId, LessonEvent[]> = {
  response: [N, N, N],
  practice: [N, N, N, { type: 'ANSWER', optionId: 'left' }, N],
  check: [N, N, N, { type: 'ANSWER', optionId: 'left' }, N, { type: 'ANSWER', optionId: 'profit' }, N],
}

const correctOf = (itemId: string) => ITEMS_BY_ID[itemId].options.find((o) => o.outcome.kind === 'correct')!.id

function classify(kind: 'correct' | 'misconception' | 'unsure', code?: string) {
  return kind === 'misconception' ? code! : kind
}

/** Speech → intent (the same function every answer screen uses). Speech matches are always shown for confirmation. */
function understand(c: EvalCase, options: MatchableOption[]) {
  if (c.input.mode === 'tap') return { route: 'score' as Route, optionId: c.input.value }
  const hasAmounts = options.some((o) => o.amount !== undefined)
  const parsedAmount = hasAmounts ? parseSpokenAmounts(c.input.value, c.language).value : undefined
  const intent = interpretUtterance(c.input.value, c.language, options)
  if (intent.kind === 'answer') {
    const proposedAmount = options.find((o) => o.id === intent.optionId)?.amount
    // A misheard amount is shown to the learner ("We heard ₹1,700"); she rejects it if it is not what she said.
    const rejected = c.input.intendedAmount !== undefined && proposedAmount !== undefined && proposedAmount !== c.input.intendedAmount
    return { route: 'propose_confirm' as Route, optionId: rejected ? undefined : intent.optionId, parsedAmount, proposedAmount, rejected, intent }
  }
  return { route: null, parsedAmount, intent }
}

/** What the app does with a turn that is not (yet) an answer — mirrors VoiceAnswer + the lesson explain client. */
function nonAnswer(c: EvalCase, intent: UtteranceIntent | undefined, surface: 'assessment' | 'lesson', options: MatchableOption[]) {
  const T = (k: string, v?: Record<string, string>) => translate(c.language, k as never, v)
  const lesson = surface === 'lesson'
  const k = intent?.kind
  const misheard = c.input.intendedAmount !== undefined
  if (k === 'sensitive_information') return { route: 'redirect_private' as Route, classification: 'sensitive_information', text: T('intent.sensitive'), toModel: false }
  if (k === 'out_of_scope' && intent!.reason === 'advice') return { route: 'redirect_advice' as Route, classification: 'leave_curriculum', text: T('intent.advice'), toModel: false }
  if (k === 'out_of_scope') return { route: (lesson ? 'ai_interpret' : 'no_match_prompt') as Route, classification: 'leave_curriculum', text: T('intent.leave'), toModel: lesson }
  if (k === 'clarification_request') return { route: (lesson ? 'ai_interpret' : 'replay') as Route, classification: 'clarification_request', text: T(intent!.mode === 'simplify' ? (lesson ? 'intent.simplifyLesson' : 'intent.simplifyCheck') : 'intent.repeat'), toModel: lesson }
  if (k === 'ambiguous_amount') {
    const shown = intent!.amounts.filter((a) => options.some((o) => o.amount === a))
    const text = shown.length >= 2 ? T('intent.whichAmount', { list: shown.map(inr).join(' / ') }) : T('intent.whichAmountGeneric')
    return { route: 'no_match_prompt' as Route, classification: 'ambiguous', text, toModel: false }
  }
  if (k === 'uncertain') return { route: 'no_match_prompt' as Route, classification: 'unsure', text: T('intent.uncertain'), toModel: false }
  const classification = k === 'unrelated' ? 'unrelated' : k === 'ambiguous_option' ? 'ambiguous' : misheard ? 'misheard_no_match' : 'not_understood'
  return { route: (lesson ? 'ai_interpret' : 'no_match_prompt') as Route, classification, text: k === 'unrelated' ? T('intent.unrelated') : T('stt.noMatch'), toModel: lesson }
}

export function runCase(c: EvalCase): SystemResult {
  return c.context.surface === 'assessment' ? runAssessment(c) : runLesson(c)
}

function runAssessment(c: EvalCase): SystemResult {
  const ctx = c.context as Extract<EvalCase['context'], { surface: 'assessment' }>
  const q = renderItem(ctx.itemId, c.business, c.language)
  const allowed = [...new Set([...Object.values(q.values), ...q.options.flatMap((o) => (o.amount !== undefined ? [o.amount] : []))])]
  const correctAmount = q.options.find((o) => o.id === correctOf(ctx.itemId))?.amount
  const u = understand(c, q.options)
  const base = { allowed, correctAmount, parsedAmount: u.parsedAmount, proposedAmount: 'proposedAmount' in u ? u.proposedAmount : undefined }

  if (!u.optionId) {
    const rejected = 'rejected' in u && u.rejected
    const n = nonAnswer(c, 'intent' in u ? u.intent : undefined, 'assessment', q.options)
    return {
      ...base,
      route: rejected ? 'propose_confirm' : n.route,
      matchReason: 'intent' in u ? u.intent?.kind : undefined,
      classification: rejected ? 'misheard_needs_confirmation' : n.classification,
      correctness: 'not_scored',
      nextAction: 'stay_on_question',
      sentToModel: false, // the assessment screen has no AI layer
      response: resp(rejected ? translate(c.language, 'stt.noMatch') : n.text, n.route.startsWith('redirect') ? 'redirect' : 'clarification', c.concept, 'repeat'),
      responseSource: 'no_match_prompt',
    }
  }

  // Answer the earlier items correctly, then the target item — the real engine decides what happens next.
  let s = startAssessment({ learnerId: 'EV-01', business: c.business, attempt: ctx.attempt, now: '2026-01-01T00:00:00Z' })
  if (!s.itemIds.includes(ctx.itemId)) throw new Error(`${c.id}: item ${ctx.itemId} is not served on attempt ${ctx.attempt}`)
  for (const id of s.itemIds.slice(0, s.itemIds.indexOf(ctx.itemId)))
    s = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: c.language, answeredAt: '2026-01-01T00:00:00Z' }).session
  const r = submitAnswer(s, { itemId: ctx.itemId, optionId: u.optionId, source: c.input.mode === 'tap' ? 'tap' : 'voice', lang: c.language, answeredAt: '2026-01-01T00:01:00Z' })
  const scored = scoreAnswer(ctx.itemId, u.optionId)
  let nextAction = 'continue_assessment'
  if (r.nextAction === 'complete_assessment') nextAction = `complete_assessment+recommend:${finalize(r.session, { now: '2026-01-01T00:02:00Z' }).recommendation.lessonId}`
  else if (scored.provisionalLesson) nextAction += `+flag:${scored.provisionalLesson}`
  const kind = scored.outcome.kind
  const head = at(c.language, kind === 'correct' ? 'fb.correct' : kind === 'unsure' ? 'fb.unsure' : 'fb.misconception')
  const text = [head, q.explanation, kind === 'misconception' ? at(c.language, 'fb.together') : ''].filter(Boolean).join(' ')
  return {
    ...base,
    route: u.route,
    optionId: u.optionId,
    classification: classify(kind, scored.outcome.kind === 'misconception' ? scored.outcome.code : undefined),
    correctness: kind === 'correct' ? 'correct' : kind === 'unsure' ? 'unsure' : 'incorrect',
    nextAction,
    sentToModel: false,
    response: resp(text, kind === 'correct' ? 'encouragement' : 'explanation', c.concept, 'continue'),
    responseSource: 'assessment_feedback',
  }
}

export function lessonStateFor(c: EvalCase): { state: LessonState; question: QuestionId } {
  const ctx = c.context as Extract<EvalCase['context'], { surface: 'lesson' }>
  const events = [...PREFIX[ctx.question]]
  for (const a of ctx.priorAnswers ?? []) events.push({ type: 'ANSWER', optionId: a }, { type: 'RETRY' })
  const init = initialState({ content: RVP, business: c.business, now: 't' })
  return { state: replay(init, events, RVP), question: ctx.question }
}

function runLesson(c: EvalCase): SystemResult {
  const { state, question } = lessonStateFor(c)
  const rq = renderLessonQuestion(RVP, question, c.business, c.language)
  const v = valuesFor(RVP, c.business, question)
  const correctOpt = RVP.questions[question].options.find((o) => o.outcome.kind === 'correct')!
  const correctAmount = correctOpt.amountOf ? v[correctOpt.amountOf] : undefined
  const u = understand(c, rq.options)
  const allowed = allowedAmounts(RVP, c.business, stageFromState(state)!)

  if (!u.optionId) {
    if ('rejected' in u && u.rejected)
      return {
        allowed,
        correctAmount,
        route: 'propose_confirm',
        parsedAmount: u.parsedAmount,
        proposedAmount: u.proposedAmount,
        classification: 'misheard_needs_confirmation',
        correctness: 'not_scored',
        nextAction: 'stay_on_question',
        sentToModel: false,
        response: resp(translate(c.language, 'stt.noMatch'), 'clarification', c.concept, 'repeat'),
        responseSource: 'no_match_prompt',
      }
    // Safe non-answers go to the explain client (Claude or approved fallback); sensitive / advice / two-amount
    // answers are answered on the device with approved messages and never sent.
    const n = nonAnswer(c, u.intent, 'lesson', rq.options)
    const fb = n.toModel ? approvedFallback(RVP, state, c.language, 'interpret', 'not_configured') : resp(n.text, n.route.startsWith('redirect') ? 'redirect' : 'clarification', c.concept, 'repeat')
    return {
      allowed,
      correctAmount,
      route: n.route,
      parsedAmount: u.parsedAmount,
      matchReason: u.intent?.kind,
      classification: n.classification,
      correctness: 'not_scored',
      nextAction: 'stay_on_question',
      sentToModel: n.toModel,
      response: fb,
      responseSource: n.toModel ? 'approved_fallback' : 'no_match_prompt',
    }
  }

  const next = transition(state, { type: 'ANSWER', optionId: u.optionId }, { content: RVP, now: 't' })
  const last = next.questions[question].attempts.at(-1)!
  const fb = renderFeedback(RVP, next, question, c.language)!
  const retry = canRetry(next, RVP, question)
  const tone = last.outcome.kind === 'correct' ? 'positive' : last.outcome.kind === 'unsure' ? 'unsure' : 'corrective'
  const nextAction = tone === 'positive' ? (canAdvance(next) ? 'feedback:positive→continue' : 'feedback:positive→stuck') : `feedback:${tone}→${retry ? 'retry_allowed' : 'continue_no_retry'}`
  const text = [fb.message, fb.closing].filter(Boolean).join(' ')
  return {
    allowed: allowedAmounts(RVP, c.business, stageFromState(next)!),
    correctAmount,
    route: u.route,
    optionId: u.optionId,
    parsedAmount: u.parsedAmount,
    proposedAmount: u.proposedAmount,
    classification: classify(last.outcome.kind, last.outcome.kind === 'misconception' ? last.outcome.code : undefined),
    correctness: last.outcome.kind === 'correct' ? 'correct' : last.outcome.kind === 'unsure' ? 'unsure' : 'incorrect',
    nextAction,
    sentToModel: false,
    response: resp(text, tone === 'positive' ? 'encouragement' : 'explanation', c.concept, retry ? 'retry' : 'continue'),
    responseSource: 'lesson_feedback',
  }
}

function resp(text: string, responseType: AiResponse['responseType'], conceptId: string, suggestedNextAction: AiResponse['suggestedNextAction']): AiResponse {
  return { responseType, displayText: text, spokenText: text, conceptId, requiresClarification: responseType === 'clarification', suggestedNextAction }
}

// Contract between the lesson UI, the /api/explain endpoint and Claude.
// The model only ever produces an AiResponse. It never produces lesson events, scores or amounts of its own.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { MisconceptionCode } from '../assessment/types'
import type { StepId } from '../learning/types'

export const RESPONSE_TYPES = ['explanation', 'clarification', 'encouragement', 'redirect'] as const
export const NEXT_ACTIONS = ['continue', 'repeat', 'retry'] as const
export type AiResponseType = (typeof RESPONSE_TYPES)[number]
export type AiNextAction = (typeof NEXT_ACTIONS)[number]

/** The structured output requested from Claude (validated at runtime on the server and again in the browser). */
export interface AiResponse {
  responseType: AiResponseType
  spokenText: string
  displayText: string
  conceptId: string
  requiresClarification: boolean
  suggestedNextAction: AiNextAction
}

/**
 * explain   – learner asked for another explanation of the current step.
 * interpret – learner said/typed something that the deterministic matcher could not map to an option.
 */
export type ExplainMode = 'explain' | 'interpret'

/** Lesson stage = step + whether the question on it is still open. Decides which content and amounts are allowed. */
export type Stage =
  | 'assessment_result'
  | 'intro'
  | 'example'
  | 'response:asking'
  | 'response:feedback'
  | 'practice:asking'
  | 'practice:feedback'
  | 'check:asking'
  | 'check:feedback'
  | 'challenge'

/** What the browser sends. IDs and the learner's own words only; the server looks up all approved content itself. */
export interface ExplainRequest {
  lessonId: string
  lang: Lang
  business: Business
  step: Exclude<StepId, 'complete'>
  phase?: 'asking' | 'feedback'
  mode: ExplainMode
  learnerAnswer?: { optionId?: string; text?: string }
  misconceptions?: MisconceptionCode[]
  attempts?: number
}

export type ExplainSource = 'claude' | 'fallback'

/** Reasons the app showed approved content instead of a model response. */
export type FallbackReason =
  | 'disabled'
  | 'offline'
  | 'not_configured'
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'upstream_unavailable'
  | 'upstream_auth'
  | 'invalid_request'
  | 'invalid_json'
  | 'schema_invalid'
  | 'refusal'
  | 'truncated'
  | 'pre:advice'
  | 'pre:private'
  | `guard:${string}`

export interface ExplainResult {
  source: ExplainSource
  response: AiResponse
  reason?: FallbackReason
}

// Approved fallback explanations. Used whenever Claude is unavailable, not configured, offline,
// too slow, or produced something the guards refused. Every string here comes from reviewed lesson content.
import type { Lang } from '../i18n/strings'
import { renderFeedback, text, valuesFor } from '../learning/render'
import type { LessonContent, LessonState } from '../learning/types'
import { questionOfStage, stageFromState } from './pack'
import type { AiResponse, ExplainMode, FallbackReason } from './types'

const respond = (content: LessonContent, displayText: string, patch: Partial<AiResponse> = {}): AiResponse => ({
  responseType: 'explanation',
  displayText,
  spokenText: displayText,
  conceptId: content.id,
  requiresClarification: false,
  suggestedNextAction: 'repeat',
  ...patch,
})

export function approvedFallback(content: LessonContent, state: LessonState, lang: Lang, mode: ExplainMode, reason?: FallbackReason): AiResponse {
  const tx = (k: string) => text(content, lang, state.business, k)
  if (reason === 'pre:advice') return respond(content, tx('ai.redirect.advice'), { responseType: 'redirect', suggestedNextAction: 'continue' })
  if (reason === 'pre:private') return respond(content, tx('ai.redirect.private'), { responseType: 'redirect', suggestedNextAction: 'continue' })
  if (mode === 'interpret') return respond(content, tx('ai.clarify'), { responseType: 'clarification', requiresClarification: true })

  const stage = stageFromState(state)
  const q = stage ? questionOfStage(stage) : null
  // Once a question is answered, the deterministic feedback (or its approved alternative) is the explanation.
  if (q && stage!.endsWith(':feedback')) {
    const last = state.questions[q].attempts.at(-1)
    if (q === 'response' && last && last.outcome.kind !== 'correct') {
      const v = valuesFor(content, state.business, 'example')
      return respond(content, text(content, lang, state.business, 'fb.response.another', v))
    }
    const fb = renderFeedback(content, state, q, lang)
    if (fb) return respond(content, fb.message)
  }
  // Steps with approved alternative explanations: show the next variant.
  const n = content.explainVariants[state.step] ?? 0
  if ((state.step === 'intro' || state.step === 'example') && n > 1) {
    const next = ((state.variant[state.step] ?? 0) + 1) % n
    const key = `${state.step}.${next}`
    const v = state.step === 'example' ? valuesFor(content, state.business, 'example') : {}
    return respond(content, text(content, lang, state.business, key, v))
  }
  // Open questions: restate the rule, never the answer.
  return respond(content, tx('complete.rule'))
}

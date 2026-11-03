// Browser side of AI explanations. Talks only to our own backend (/api/explain); never to Anthropic directly,
// and never holds a credential. Whatever happens (offline, no key, timeout, refused output) the caller
// gets a usable result: either a validated model response or approved fallback content.
import { checkShape, guardAiResponse, screenLearnerText } from '../../shared/aiGuards.mjs'
import type { Lang } from '../i18n/strings'
import { misconceptions } from '../learning/machine'
import type { LessonContent, LessonState } from '../learning/types'
import { approvedFallback } from './fallback'
import { allowedAmounts, questionOfStage, revealRule, stageFromState } from './pack'
import type { AiResponse, ExplainMode, ExplainRequest, ExplainResult, FallbackReason } from './types'

export const MAX_LEARNER_TEXT = 300

export interface ExplainContext {
  content: LessonContent
  state: LessonState
  lang: Lang
  mode: ExplainMode
  /** Learner's own words (interpret mode). Screened on the device before anything is sent. */
  learnerText?: string
}

export interface ExplainService {
  explain(ctx: ExplainContext): Promise<ExplainResult>
}

export function buildRequest(ctx: ExplainContext): ExplainRequest | null {
  const { state, content, lang, mode } = ctx
  if (state.step === 'complete') return null
  const stage = stageFromState(state)!
  const q = questionOfStage(stage)
  const answered = q && stage.endsWith(':feedback') ? state.questions[q].attempts.at(-1) : undefined
  const text = ctx.learnerText?.trim().slice(0, MAX_LEARNER_TEXT)
  const req: ExplainRequest = {
    lessonId: content.id,
    lang,
    business: state.business,
    step: state.step,
    mode,
    misconceptions: misconceptions(state).observed.slice(0, 5),
  }
  if (state.step === 'practice' || state.step === 'check') req.phase = state.questions[state.step].phase
  if (q) req.attempts = state.questions[q].attempts.length
  if (answered || text) req.learnerAnswer = { ...(answered ? { optionId: answered.optionId } : {}), ...(text ? { text } : {}) }
  return req
}

export function createExplainService(opts: { fetchImpl?: typeof fetch; endpoint?: string; timeoutMs?: number; isOnline?: () => boolean } = {}): ExplainService {
  const endpoint = opts.endpoint ?? '/api/explain'
  const timeoutMs = opts.timeoutMs ?? 12_000
  const isOnline = opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)
  // Ask the backend once whether AI is configured, so a demo without a key never POSTs (and never logs 503s).
  let notConfigured = false
  let status: Promise<boolean | null> | null = null
  const checkConfigured = (doFetch: typeof fetch) =>
    (status ??= doFetch(`${endpoint}/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { configured?: boolean } | null) => (j && typeof j.configured === 'boolean' ? j.configured : null))
      .catch(() => null)
      .then((v) => {
        if (v === null) status = null // unknown (backend down): ask again next time
        return v
      }))

  return {
    async explain(ctx) {
      const fallback = (reason: FallbackReason): ExplainResult => ({
        source: 'fallback',
        reason,
        response: approvedFallback(ctx.content, ctx.state, ctx.lang, ctx.mode, reason),
      })
      if (ctx.mode === 'interpret' && ctx.learnerText) {
        const screened = screenLearnerText(ctx.learnerText)
        if (screened) return fallback(`pre:${screened}`) // personal data never leaves the device
      }
      const req = buildRequest(ctx)
      if (!req) return fallback('invalid_request')
      if (notConfigured) return fallback('not_configured')
      if (!isOnline()) return fallback('offline')

      const doFetch = opts.fetchImpl ?? fetch
      const configured = await checkConfigured(doFetch)
      if (configured === false) {
        notConfigured = true
        return fallback('not_configured')
      }
      if (configured === null) return fallback('network')
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      let body: unknown
      let status = 0
      try {
        const res = await doFetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: ac.signal })
        status = res.status
        body = await res.json().catch(() => null)
      } catch {
        return fallback(ac.signal.aborted ? 'timeout' : 'network')
      } finally {
        clearTimeout(timer)
      }
      const b = body as { ok?: boolean; reason?: FallbackReason; error?: string; response?: AiResponse } | null
      if (status === 503 && b?.error === 'not_configured') {
        notConfigured = true
        return fallback('not_configured')
      }
      if (status === 400) return fallback('invalid_request')
      if (!b || status !== 200) return fallback('upstream_unavailable')
      if (!b.ok || !b.response) return fallback(b.reason ?? 'upstream_unavailable')

      // Defence in depth: re-check what the server already checked, with the browser's own copy of the content.
      const shape = checkShape(b.response)
      if (!shape.ok) return fallback('schema_invalid')
      const stage = stageFromState(ctx.state)!
      const g = guardAiResponse(b.response, {
        lang: ctx.lang,
        conceptId: ctx.content.id,
        allowed: allowedAmounts(ctx.content, ctx.state.business, stage),
        reveal: revealRule(ctx.content, ctx.state.business, stage),
      })
      if (!g.ok) return fallback(`guard:${g.code}`)
      return { source: 'claude', response: b.response }
    },
  }
}

/** Service that never calls the network (tests, gallery frames, and builds without a backend). */
export function createOfflineExplainService(reason: FallbackReason = 'disabled'): ExplainService {
  return {
    async explain(ctx) {
      const pre = ctx.mode === 'interpret' && ctx.learnerText ? screenLearnerText(ctx.learnerText) : null
      const r: FallbackReason = pre ? `pre:${pre}` : reason
      return { source: 'fallback', reason: r, response: approvedFallback(ctx.content, ctx.state, ctx.lang, ctx.mode, r) }
    },
  }
}

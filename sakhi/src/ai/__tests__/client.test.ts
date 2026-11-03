import { describe, expect, it } from 'vitest'
import { REVENUE_VS_PROFIT as C } from '../../learning/content/revenueVsProfit'
import { initialState, replay } from '../../learning/machine'
import type { LessonEvent } from '../../learning/types'
import { permittedAction } from '../actions'
import { buildRequest, createExplainService, createOfflineExplainService } from '../explainClient'
import { approvedFallback } from '../fallback'
import type { AiResponse } from '../types'

const N: LessonEvent = { type: 'NEXT' }
const at = (events: LessonEvent[], business: 'vegetable' | 'tea' | 'grocery' = 'vegetable') =>
  replay(initialState({ content: C, business, now: 't', fromAssessment: ['misconception_revenue_vs_profit'] }), events, C)
const S = {
  intro: at([N]),
  example: at([N, N]),
  response: at([N, N, N]),
  wrong: at([N, N, N, { type: 'ANSWER', optionId: 'sales' }]),
  right: at([N, N, N, { type: 'ANSWER', optionId: 'left' }]),
  practice: at([N, N, N, { type: 'ANSWER', optionId: 'left' }, N]),
  practiceWrong: at([N, N, N, { type: 'ANSWER', optionId: 'left' }, N, { type: 'ANSWER', optionId: 'sales' }]),
  check: at([N, N, N, { type: 'ANSWER', optionId: 'left' }, N, { type: 'ANSWER', optionId: 'profit' }, N]),
}
const R = (displayText: string, patch: Partial<AiResponse> = {}): AiResponse => ({
  responseType: 'explanation',
  spokenText: displayText,
  displayText,
  conceptId: 'revenue_vs_profit',
  requiresClarification: false,
  suggestedNextAction: 'continue',
  ...patch,
})
let notConfiguredBackend = false
function fakeFetch(handler: (body: Record<string, unknown>) => { status: number; json: unknown } | Promise<never>) {
  const calls: Record<string, unknown>[] = []
  const f = (async (url: string, init: RequestInit = {}) => {
    if (url.endsWith('/status')) return new Response(JSON.stringify({ configured: !notConfiguredBackend }), { status: 200 })
    const body = JSON.parse(String(init.body))
    calls.push(body)
    const r = await handler(body)
    return new Response(JSON.stringify(r.json), { status: r.status })
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('request built by the browser: IDs and the learner’s words only', () => {
  it('explain at feedback carries the answered option, misconceptions and attempts — no lesson text or amounts', () => {
    expect(buildRequest({ content: C, state: S.wrong, lang: 'hi', mode: 'explain' })).toEqual({
      lessonId: 'revenue_vs_profit',
      lang: 'hi',
      business: 'vegetable',
      step: 'feedback',
      mode: 'explain',
      misconceptions: ['misconception_revenue_vs_profit'],
      attempts: 1,
      learnerAnswer: { optionId: 'sales' },
    })
  })
  it('practice includes its phase; interpret includes trimmed words (max 300 chars)', () => {
    const r = buildRequest({ content: C, state: S.practice, lang: 'te', mode: 'interpret', learnerText: '  naaku ' + 'x'.repeat(400) })!
    expect(r.phase).toBe('asking')
    expect(r.learnerAnswer!.text!.length).toBe(300)
    expect(r.learnerAnswer!.optionId).toBeUndefined()
  })
})

describe('explain service', () => {
  const ctx = { content: C, state: S.example, lang: 'en' as const, mode: 'explain' as const }

  it('returns a validated Claude response', async () => {
    const { f } = fakeFetch(() => ({ status: 200, json: { ok: true, response: R('Out of ₹500, ₹300 went to the mandi; ₹200 stays with you.') } }))
    const r = await createExplainService({ fetchImpl: f }).explain(ctx)
    expect(r.source).toBe('claude')
  })

  it('re-checks the server’s answer in the browser (wrong amount → approved fallback)', async () => {
    const { f } = fakeFetch(() => ({ status: 200, json: { ok: true, response: R('₹500 − ₹300 = ₹250 is left.') } }))
    const r = await createExplainService({ fetchImpl: f }).explain(ctx)
    expect(r).toMatchObject({ source: 'fallback', reason: 'guard:numbers' })
    expect(r.response.displayText).toBe(approvedFallback(C, S.example, 'en', 'explain').displayText)
  })

  it('server fallback reasons, invalid shapes and HTTP errors all give approved content', async () => {
    for (const [status, json, reason] of [
      [200, { ok: false, reason: 'invalid_json' }, 'invalid_json'],
      [200, { ok: true, response: { ...R('x'), extra: 1 } }, 'schema_invalid'],
      [400, { error: 'invalid_request' }, 'invalid_request'],
      [502, { error: 'bad gateway' }, 'upstream_unavailable'],
    ] as const) {
      const { f } = fakeFetch(() => ({ status, json }))
      const r = await createExplainService({ fetchImpl: f }).explain(ctx)
      expect(r, String(reason)).toMatchObject({ source: 'fallback', reason })
      expect(r.response.displayText.length).toBeGreaterThan(0)
    }
  })

  it('not configured (no key): status is checked once and nothing is POSTed', async () => {
    notConfiguredBackend = true
    const { f, calls } = fakeFetch(() => ({ status: 200, json: {} }))
    const svc = createExplainService({ fetchImpl: f })
    expect((await svc.explain(ctx)).reason).toBe('not_configured')
    expect((await svc.explain(ctx)).reason).toBe('not_configured')
    expect(calls).toHaveLength(0)
    notConfiguredBackend = false
  })
  it('a 503 not_configured reply (key removed after start-up) also falls back and stops further calls', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 503, json: { error: 'not_configured' } }))
    const svc = createExplainService({ fetchImpl: f })
    expect((await svc.explain(ctx)).reason).toBe('not_configured')
    expect((await svc.explain(ctx)).reason).toBe('not_configured')
    expect(calls).toHaveLength(1)
  })

  it('network error, timeout and offline → approved content', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch
    expect((await createExplainService({ fetchImpl: down }).explain(ctx)).reason).toBe('network')
    const hang = ((u: string, init: RequestInit) => u.endsWith('/status') ? Promise.resolve(new Response('{"configured":true}')) : new Promise((_, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))) as unknown as typeof fetch
    expect((await createExplainService({ fetchImpl: hang, timeoutMs: 20 }).explain(ctx)).reason).toBe('timeout')
    const { f, calls } = fakeFetch(() => ({ status: 200, json: {} }))
    expect((await createExplainService({ fetchImpl: f, isOnline: () => false }).explain(ctx)).reason).toBe('offline')
    expect(calls).toHaveLength(0)
  })

  it('personal data and advice questions are answered on the device and never sent', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: {} }))
    const svc = createExplainService({ fetchImpl: f })
    const priv = await svc.explain({ content: C, state: S.response, lang: 'hi', mode: 'interpret', learnerText: 'mera number 9876543210 hai' })
    expect(priv).toMatchObject({ source: 'fallback', reason: 'pre:private', response: { responseType: 'redirect' } })
    expect(priv.response.displayText).toMatch(/[ऀ-ॿ]/)
    const adv = await svc.explain({ content: C, state: S.response, lang: 'te', mode: 'interpret', learnerText: 'loan teesukovala?' })
    expect(adv).toMatchObject({ reason: 'pre:advice', response: { responseType: 'redirect' } })
    expect(calls).toHaveLength(0)
  })

  it('offline service (gallery / tests) also screens learner words', async () => {
    const r = await createOfflineExplainService().explain({ content: C, state: S.response, lang: 'en', mode: 'interpret', learnerText: 'should I invest?' })
    expect(r.reason).toBe('pre:advice')
  })
})

describe('approved fallbacks', () => {
  it('never reveal an answer while a question is open; use the rule instead', () => {
    for (const lang of ['en', 'hi', 'te'] as const)
      for (const s of [S.response, S.practice, S.check]) {
        const r = approvedFallback(C, s, lang, 'explain')
        expect(r.displayText).toBe(C.text[lang].t['complete.rule'])
      }
  })
  it('after a wrong first answer: the approved alternative explanation', () => {
    expect(approvedFallback(C, S.wrong, 'en', 'explain').displayText).toBe('Think of it like this: you have ₹500 and you pay ₹300. You have ₹200 left.')
    expect(approvedFallback(C, S.practiceWrong, 'en', 'explain').displayText).toContain('₹800 − ₹530 = ₹270')
  })
  it('intro/example: next approved variant; interpret: approved clarification in the learner’s language', () => {
    expect(approvedFallback(C, S.intro, 'en', 'explain').displayText).toContain('mandi')
    expect(approvedFallback(C, S.response, 'te', 'interpret')).toMatchObject({ responseType: 'clarification', requiresClarification: true, displayText: C.text.te.t['ai.clarify'] })
  })
})

describe('the application decides whether a suggested action is allowed', () => {
  it('"continue" is refused while a question is open (Claude cannot skip a question)', () => {
    expect(permittedAction('continue', S.response, C)).toBeNull()
    expect(permittedAction('continue', S.practice, C)).toBeNull()
    expect(permittedAction('continue', S.example, C)).toEqual({ action: 'continue', event: { type: 'NEXT' } })
  })
  it('"retry" only when the state machine allows another attempt', () => {
    expect(permittedAction('retry', S.wrong, C)).toEqual({ action: 'retry', event: { type: 'RETRY' } })
    expect(permittedAction('retry', S.right, C)).toBeNull() // already correct
    expect(permittedAction('retry', S.example, C)).toBeNull() // no question
    const twice = at([N, N, N, { type: 'ANSWER', optionId: 'sales' }, { type: 'RETRY' }, { type: 'ANSWER', optionId: 'added' }])
    expect(permittedAction('retry', twice, C)).toBeNull() // attempts used up
  })
  it('"repeat" never dispatches a lesson event', () => {
    expect(permittedAction('repeat', S.response, C)).toEqual({ action: 'repeat', event: null })
  })
})

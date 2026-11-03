// /api/explain with the OFFICIAL Anthropic SDK and a fake fetch: every request is built by the real SDK,
// every reply is a Messages-API-shaped response written by hand (fictional content, no network, no key).
// Model replies below are test fixtures authored for these tests, not real Claude output.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { createSpeechApp } from '../app.mjs'

const KEY = 'sk-test-not-a-real-key'
const logs = []
let calls = []
let reply = null // (call) => Response | Promise<Response>

const claudeFetch = async (url, init) => {
  const headers = Object.fromEntries(new Headers(init.headers).entries())
  const call = { url: String(url), headers, body: JSON.parse(init.body), signal: init.signal }
  calls.push(call)
  return reply(call)
}

const message = (obj, extra = {}) =>
  new Response(
    JSON.stringify({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1200, output_tokens: 90 },
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
const apiError = (status, type) => new Response(JSON.stringify({ type: 'error', error: { type, message: 'x' } }), { status, headers: { 'content-type': 'application/json' } })
const R = (displayText, patch = {}) => ({
  responseType: 'explanation',
  spokenText: displayText,
  displayText,
  conceptId: 'revenue_vs_profit',
  requiresClarification: false,
  suggestedNextAction: 'continue',
  ...patch,
})

function start(env) {
  const server = createServer(createSpeechApp({ env, claudeFetchImpl: claudeFetch, log: (e) => logs.push(e), cacheDir: null }))
  return new Promise((r) => server.listen(0, () => r({ server, base: `http://127.0.0.1:${server.address().port}` })))
}
let main, bare, slow, limited
beforeAll(async () => {
  main = await start({ ANTHROPIC_API_KEY: KEY, EXPLAIN_RATE_PER_MIN: '1000' })
  bare = await start({})
  slow = await start({ ANTHROPIC_API_KEY: KEY, CLAUDE_TIMEOUT_MS: '300' })
  limited = await start({ ANTHROPIC_API_KEY: KEY, EXPLAIN_RATE_PER_MIN: '2' })
})
afterAll(() => [main, bare, slow, limited].forEach((s) => s.server.close()))
beforeEach(() => {
  calls = []
  logs.length = 0
  reply = () => message(R('Sales is all the money customers give you. Profit is what is left after your costs.'))
})

const post = async (body, srv = main) => {
  const r = await fetch(`${srv.base}/api/explain`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
const base = { lessonId: 'revenue_vs_profit', lang: 'en', business: 'vegetable', step: 'intro', mode: 'explain' }

// ── Configuration & request to Claude ─────────────────────────────────

describe('configuration', () => {
  it('without ANTHROPIC_API_KEY: status says not configured and explain answers 503 (client uses approved fallback)', async () => {
    expect(await (await fetch(`${bare.base}/api/explain/status`)).json()).toMatchObject({ configured: false, provider: 'anthropic' })
    const r = await post(base, bare)
    expect(r).toEqual({ status: 503, body: { error: 'not_configured' } })
  })
  it('status never exposes the key', async () => {
    const s = await (await fetch(`${main.base}/api/explain/status`)).json()
    expect(s).toMatchObject({ configured: true, model: 'claude-haiku-5-5', lessons: ['revenue_vs_profit'] })
    expect(JSON.stringify(s)).not.toContain(KEY)
  })
})

describe('request sent through the official SDK', () => {
  it('uses the key from env, the real API host, structured output, low effort and no thinking', async () => {
    const r = await post({ ...base, step: 'example', business: 'tea', lang: 'hi' })
    expect(r.status).toBe(200)
    const c = calls[0]
    // ANTHROPIC_BASE_URL from the host shell is ignored on purpose.
    expect(c.url).toBe('https://api.anthropic.com/v1/messages')
    // SDK 1.x sends the API key as a bearer credential; only the key from env is used.
    expect(c.headers['x-api-key'] ?? c.headers.authorization?.replace(/^Bearer /, '')).toBe(KEY)
    expect(c.headers['anthropic-version']).toBeTruthy()
    expect(c.body.model).toBe('claude-haiku-5-5')
    expect(c.body.thinking).toEqual({ type: 'disabled' })
    expect(c.body.output_config.effort).toBe('low')
    expect(c.body.output_config.format.type).toBe('json_schema')
    expect(c.body.output_config.format.schema.required).toEqual(['responseType', 'spokenText', 'displayText', 'conceptId', 'requiresClarification', 'suggestedNextAction'])
    expect(c.body.output_config.format.schema.additionalProperties).toBe(false)
    expect('temperature' in c.body).toBe(false)
  })

  it('model input = language, business, concept, approved content, validated example, state — built server-side', async () => {
    await post({ ...base, step: 'example', business: 'tea', lang: 'te' })
    const sys = calls[0].body.system[0].text
    expect(sys).toMatch(/Use ONLY amounts listed in validatedExample/)
    expect(sys).toMatch(/loans, borrowing, interest/)
    const user = calls[0].body.messages[0].content
    const ctx = JSON.parse(user.match(/<lesson_context>\n([\s\S]*?)\n<\/lesson_context>/)[1])
    expect(ctx).toMatchObject({
      conceptId: 'revenue_vs_profit',
      language: expect.stringMatching(/Telugu script/),
      business: expect.stringMatching(/tea stall/),
      lessonStage: 'example',
      questionOpen: false,
      validatedExample: { sales: '₹600', goodsCost: '₹350', left: '₹250', fuel: '₹60', profit: '₹190' },
    })
    expect(ctx.approvedContent.join(' ')).toMatch(/[ఀ-౿]/) // Telugu approved text
    expect(user).not.toContain('<learner_words>')
  })

  it('while a question is open the model is not told the answer', async () => {
    reply = () => message(R('Look at the choices again. Sales was ₹500 and the vegetables cost ₹300.', { responseType: 'clarification', requiresClarification: true, suggestedNextAction: 'repeat' }))
    await post({ ...base, step: 'response', mode: 'interpret', learnerAnswer: { text: 'all of it' } })
    const ctx = JSON.parse(calls[0].body.messages[0].content.match(/<lesson_context>\n([\s\S]*?)\n<\/lesson_context>/)[1])
    expect(ctx.questionOpen).toBe(true)
    expect(ctx.question.correctChoice).toBeUndefined()
    expect(ctx.validatedExample).toEqual({ sales: '₹500', goodsCost: '₹300', spoilage: '₹40', transport: '₹30' })
  })

  it('after an answer, its result comes from the lesson pack, not from the client', async () => {
    await post({ ...base, step: 'feedback', learnerAnswer: { optionId: 'sales' }, misconceptions: ['misconception_revenue_vs_profit'], attempts: 1 })
    const ctx = JSON.parse(calls[0].body.messages[0].content.match(/<lesson_context>\n([\s\S]*?)\n<\/lesson_context>/)[1])
    expect(ctx.learnerAnswer).toEqual({ chosen: '₹500', result: 'misconception', misunderstanding: 'Counts all the sales money as profit.' })
    expect(ctx.question.correctChoice).toBe('₹200')
    expect(ctx.attemptsLeft).toBe(1)
  })
})

// ── Responses that pass ───────────────────────────────────────────────

describe('valid model responses are returned', () => {
  it('correct explanation (English, vegetable)', async () => {
    reply = () => message(R('Out of ₹500, ₹300 went back to the mandi for vegetables. What stays with you is ₹200.'))
    const r = await post({ ...base, step: 'example' })
    expect(r.body).toMatchObject({ ok: true, response: { responseType: 'explanation', conceptId: 'revenue_vs_profit' } })
    expect(logs.at(-1)).toMatchObject({ route: 'explain', status: 200, source: 'claude', stage: 'example', inputTokens: 1200 })
  })

  it('corrective feedback after an incorrect answer (Hindi)', async () => {
    const hi = 'कोई बात नहीं। ₹500 पूरी बिक्री है। इसमें से ₹300 मंडी की सब्ज़ियों में गया। ₹500 − ₹300 = ₹200 बचा।'
    reply = () => message(R(hi, { suggestedNextAction: 'retry' }))
    const r = await post({ ...base, lang: 'hi', step: 'feedback', learnerAnswer: { optionId: 'sales' }, attempts: 1 })
    expect(r.body.ok).toBe(true)
    expect(r.body.response.displayText).toBe(hi)
  })

  it('Telugu explanation in Telugu script', async () => {
    const te = 'రోజంతా వచ్చిన ₹600 అమ్మకాలు. పాలు, టీ పొడి, చక్కెరకు ₹350 పోయాక మిగిలేది ₹250.'
    reply = () => message(R(te))
    const r = await post({ ...base, lang: 'te', business: 'tea', step: 'example' })
    expect(r.body).toMatchObject({ ok: true, response: { displayText: te } })
  })

  it('ambiguous learner words → clarification', async () => {
    reply = () =>
      message(R('Do you mean the money customers gave you, or what stays after paying for the vegetables? Please pick one choice below.', { responseType: 'clarification', requiresClarification: true, suggestedNextAction: 'repeat' }))
    const r = await post({ ...base, step: 'response', mode: 'interpret', learnerAnswer: { text: 'the money i keep i think' } })
    expect(r.body).toMatchObject({ ok: true, response: { responseType: 'clarification', requiresClarification: true } })
    expect(calls[0].body.messages[0].content).toContain('<learner_words>\nthe money i keep i think\n</learner_words>')
  })

  it('Hindi–English code-switching in the learner’s words; reply in Devanagari with natural English terms', async () => {
    const hi = 'आपने कहा कि पूरा ₹500 profit है। ₹500 आपकी बिक्री (sales) है, पर सब्ज़ियों के ₹300 भी देने थे। नीचे से एक जवाब चुनें।'
    reply = () => message(R(hi, { responseType: 'clarification', requiresClarification: true, suggestedNextAction: 'repeat' }))
    const r = await post({ ...base, lang: 'hi', step: 'response', mode: 'interpret', learnerAnswer: { text: 'mujhe laga pura 500 mera profit hai' } })
    expect(r.body.ok).toBe(true)
  })

  it('Telugu–English code-switching; reply in Telugu script with natural English terms', async () => {
    const te = 'మీరు ₹900 మొత్తం profit అనుకుంటున్నారు. ₹900 అమ్మకాలు (sales); పాలు, టీ పొడి, చక్కెర, గ్యాస్ ఖర్చులు కూడా ఉన్నాయి. కింద ఒక జవాబు ఎంచుకోండి.'
    reply = () => message(R(te, { responseType: 'clarification', requiresClarification: true, suggestedNextAction: 'repeat' }))
    const r = await post({ ...base, lang: 'te', business: 'tea', step: 'practice', phase: 'asking', mode: 'interpret', learnerAnswer: { text: 'naaku 900 antha profit ani anipistundi' } })
    expect(r.body.ok).toBe(true)
  })

  it('unrelated question → model redirect is accepted', async () => {
    const hi = 'यह पाठ बिक्री और मुनाफ़े के बारे में है। चलिए सवाल पर लौटते हैं।'
    reply = () => message(R(hi, { responseType: 'redirect', suggestedNextAction: 'repeat' }))
    const r = await post({ ...base, lang: 'hi', step: 'response', mode: 'interpret', learnerAnswer: { text: 'aaj mausam kaisa rahega?' } })
    expect(r.body).toMatchObject({ ok: true, response: { responseType: 'redirect' } })
  })
})

// ── Responses that are refused (client shows approved fallback) ────────

describe('unsafe or invalid model output is refused', () => {
  const refused = async (text, req, patch) => {
    reply = () => message(R(text, patch))
    return (await post({ ...base, ...req })).body
  }
  it('incorrect calculation with an unapproved amount', async () => {
    expect(await refused('₹500 − ₹300 = ₹250 is left.', { step: 'example' })).toEqual({ ok: false, reason: 'guard:numbers' })
  })
  it('incorrect calculation using approved amounts', async () => {
    expect(await refused('₹500 − ₹300 = ₹130 is left after the vegetables.', { step: 'example' })).toEqual({ ok: false, reason: 'guard:arithmetic' })
  })
  it('amounts written in words cannot be checked → refused', async () => {
    expect(await refused('Five hundred rupees came in, but three hundred went to the mandi.', { step: 'example' })).toEqual({ ok: false, reason: 'guard:number_words' })
  })
  it('giving away the answer while the question is open', async () => {
    expect(await refused('The answer is ₹200.', { step: 'response', mode: 'interpret', learnerAnswer: { text: 'tell me' } }, { responseType: 'clarification', requiresClarification: true })).toEqual({
      ok: false,
      reason: 'guard:reveals_answer',
    })
  })
  it('wrong language/script for Hindi and Telugu', async () => {
    expect(await refused('Sales is the money you get. Profit is what is left.', { lang: 'hi' })).toEqual({ ok: false, reason: 'guard:script' })
    expect(await refused('बिक्री सारा पैसा है।', { lang: 'te' })).toEqual({ ok: false, reason: 'guard:script' })
  })
  it('lending / investment advice', async () => {
    expect(await refused('You could take a small loan to buy more vegetables.', { step: 'example' })).toEqual({ ok: false, reason: 'guard:topic' })
  })
  it('wrong conceptId and inconsistent clarification flag', async () => {
    expect(await refused('Sales is all the money customers give you.', {}, { conceptId: 'savings' })).toEqual({ ok: false, reason: 'guard:concept' })
    expect(await refused('Sales is all the money customers give you.', {}, { requiresClarification: true })).toEqual({ ok: false, reason: 'guard:inconsistent' })
  })
  it('invalid JSON', async () => {
    reply = () => message('Sure! Sales is the money you get and profit is what is left.')
    expect((await post(base)).body).toEqual({ ok: false, reason: 'invalid_json' })
  })
  it('JSON that breaks the schema (extra field, unknown enum, empty text)', async () => {
    reply = () => message({ ...R('Sales is money in.'), advice: 'x' })
    expect((await post(base)).body).toEqual({ ok: false, reason: 'schema_invalid' })
    reply = () => message(R('Sales is money in.', { responseType: 'chat' }))
    expect((await post(base)).body).toEqual({ ok: false, reason: 'schema_invalid' })
    reply = () => message(R('   '))
    expect((await post(base)).body).toEqual({ ok: false, reason: 'schema_invalid' })
  })
  it('refusal and truncated outputs', async () => {
    reply = () => message(R('x'), { stop_reason: 'refusal' })
    expect((await post(base)).body).toEqual({ ok: false, reason: 'refusal' })
    reply = () => message('{"responseType": "expl', { stop_reason: 'max_tokens' })
    expect((await post(base)).body).toEqual({ ok: false, reason: 'truncated' })
  })
})

// ── Learner text screened before reaching the model ───────────────────

describe('pre-screening of learner words (no model call)', () => {
  it('loan / investment questions → advice redirect, Claude not called', async () => {
    for (const text of ['should I take a loan for my shop?', 'loan lena chahiye kya', 'నేను లోన్ తీసుకోవాలా?']) {
      expect((await post({ ...base, step: 'response', mode: 'interpret', learnerAnswer: { text } })).body).toEqual({ ok: false, reason: 'pre:advice' })
    }
    expect(calls).toHaveLength(0)
  })
  it('phone / account numbers → private redirect, Claude not called, nothing logged', async () => {
    const text = 'mera number 98765 43210 hai'
    expect((await post({ ...base, step: 'response', mode: 'interpret', learnerAnswer: { text } })).body).toEqual({ ok: false, reason: 'pre:private' })
    expect(calls).toHaveLength(0)
    expect(JSON.stringify(logs)).not.toContain('98765')
  })
})

// ── API failures ──────────────────────────────────────────────────────

describe('API failures map to fallback reasons', () => {
  const cases = [
    [500, 'api_error', 'upstream_unavailable'],
    [529, 'overloaded_error', 'upstream_unavailable'],
    [429, 'rate_limit_error', 'rate_limited'],
    [401, 'authentication_error', 'upstream_auth'],
    [400, 'invalid_request_error', 'upstream_bad_request'],
  ]
  for (const [status, type, reason] of cases)
    it(`${status} ${type} → ${reason}`, async () => {
      reply = () => apiError(status, type)
      expect((await post(base)).body).toEqual({ ok: false, reason })
      expect(calls).toHaveLength(1) // no retries by default: the learner is waiting
    })
  it('network failure → upstream_unreachable', async () => {
    reply = () => {
      throw new TypeError('fetch failed')
    }
    expect((await post(base)).body).toEqual({ ok: false, reason: 'upstream_unreachable' })
  })
  it('timeout → timeout', async () => {
    reply = (c) => new Promise((_, rej) => c.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
    const t0 = Date.now()
    expect((await post(base, slow)).body).toEqual({ ok: false, reason: 'timeout' })
    expect(Date.now() - t0).toBeLessThan(3000)
  })
})

// ── Request validation, limits, privacy ───────────────────────────────

describe('request validation', () => {
  const bad = [
    ['unknown field (no personal data fields accepted)', { ...base, name: 'Lakshmi' }],
    ['unsupported language', { ...base, lang: 'ta' }],
    ['unknown lesson', { ...base, lessonId: 'loans_101' }],
    ['learner text over 300 chars', { ...base, step: 'response', mode: 'interpret', learnerAnswer: { text: 'a'.repeat(301) } }],
    ['interpret without words', { ...base, step: 'response', mode: 'interpret' }],
    ['answer id while the question is still open', { ...base, step: 'response', learnerAnswer: { optionId: 'left' } }],
    ['answer id that does not exist', { ...base, step: 'feedback', learnerAnswer: { optionId: 'all' } }],
    ['unknown misconception code', { ...base, misconceptions: ['likes_loans'] }],
    ['completed lesson', { ...base, step: 'complete' }],
  ]
  for (const [name, body] of bad)
    it(`400: ${name}`, async () => {
      expect((await post(body)).status).toBe(400)
      expect(calls).toHaveLength(0)
    })
  it('rate limit per client', async () => {
    await post(base, limited)
    await post(base, limited)
    expect((await post(base, limited)).status).toBe(429)
  })
})

describe('privacy of logs', () => {
  it('logs metadata only — never learner words or generated text', async () => {
    reply = () => message(R('Out of ₹500, ₹300 paid for the vegetables. Which choice shows what is left?', { responseType: 'clarification', requiresClarification: true }))
    await post({ ...base, step: 'response', mode: 'interpret', learnerAnswer: { text: 'my secret words' } })
    expect(logs.at(-1)).toMatchObject({ source: 'claude', responseType: 'clarification' })
    reply = () => message(R('₹500 − ₹300 = ₹250 is left.'))
    await post({ ...base, step: 'example' })
    const s = JSON.stringify(logs)
    expect(s).not.toContain('secret')
    expect(s).not.toContain('vegetables')
    expect(s).not.toContain(KEY)
    expect(logs.at(-1)).toMatchObject({ source: 'fallback', reason: 'guard:numbers', detail: 'displayText: unapproved amount 250' })
  })
})

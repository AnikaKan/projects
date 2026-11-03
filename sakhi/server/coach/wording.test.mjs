// /api/coach-wording with the OFFICIAL Anthropic SDK and a fake fetch (fixtures written for these tests, not real
// Claude output). Checks: no key → 503; what the model receives (one approved sentence, no learner history);
// validation of the reply; metadata-only logs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { createSpeechApp } from '../app.mjs'

const logs = []
let calls = []
let reply = null
const claudeFetch = async (url, init) => {
  const call = { url: String(url), body: JSON.parse(init.body) }
  calls.push(call)
  return reply(call)
}
const message = (text) =>
  new Response(JSON.stringify({ id: 'msg_t', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify({ text }) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 200, output_tokens: 30 } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
function start(env) {
  const server = createServer(createSpeechApp({ env, claudeFetchImpl: claudeFetch, log: (e) => logs.push(e), cacheDir: null }))
  return new Promise((r) => server.listen(0, () => r({ server, base: `http://127.0.0.1:${server.address().port}` })))
}
let main, bare
beforeAll(async () => {
  main = await start({ ANTHROPIC_API_KEY: 'sk-test-not-a-real-key' })
  bare = await start({})
})
afterAll(() => [main, bare].forEach((s) => s.server.close()))
beforeEach(() => {
  calls = []
  logs.length = 0
})
const SRC = 'Help Saraswathi see that selling ₹500 of vegetables does not mean she earned ₹500 in profit.'
const post = async (body, srv = main) => {
  const r = await fetch(`${srv.base}/api/coach-wording`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}

describe('/api/coach-wording', () => {
  it('without a key: 503 not_configured (the app shows the approved sentence)', async () => {
    expect(await post({ lang: 'en', text: SRC, name: 'Saraswathi' }, bare)).toEqual({ status: 503, body: { error: 'not_configured' } })
  })
  it('sends only the one approved sentence, with structured output, and returns a validated rewrite', async () => {
    reply = () => message('Show Saraswathi that ₹500 of sales is not ₹500 of profit.')
    const r = await post({ lang: 'en', text: SRC, name: 'Saraswathi' })
    expect(r).toEqual({ status: 200, body: { ok: true, text: 'Show Saraswathi that ₹500 of sales is not ₹500 of profit.' } })
    const sent = calls[0].body
    expect(sent.output_config.format.type).toBe('json_schema')
    expect(sent.messages).toHaveLength(1)
    expect(sent.messages[0].content).toContain(SRC)
    expect(JSON.stringify(sent)).not.toMatch(/assessment|evidence|misconception|DL-0/)
    expect(JSON.stringify(logs)).not.toContain('Saraswathi') // metadata only
  })
  it('rejects a rewrite with a new amount, advice, or a missing name → ok:false', async () => {
    for (const bad of ['Tell Saraswathi her profit is ₹200 not ₹500.', 'Saraswathi should take a small loan.', 'Show her that sales are not profit.']) {
      reply = () => message(bad)
      const r = await post({ lang: 'en', text: SRC, name: 'Saraswathi' })
      expect(r.status).toBe(200)
      expect(r.body.ok).toBe(false)
      expect(r.body.reason).toMatch(/^guard:/)
    }
  })
  it('refuses invalid requests and source text that is not playbook-like', async () => {
    expect((await post({ lang: 'xx', text: SRC, name: 'S' })).status).toBe(400)
    expect((await post({ lang: 'en', text: SRC, name: 'S', extra: 1 })).status).toBe(400)
    reply = () => message('x')
    expect((await post({ lang: 'en', text: 'Should Saraswathi invest in gold this month?', name: 'Saraswathi' })).body).toEqual({ ok: false, reason: 'pre:source' })
    expect(calls).toHaveLength(0)
  })
})

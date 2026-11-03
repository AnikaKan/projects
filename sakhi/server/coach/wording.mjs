// POST /api/coach-wording — OPTIONAL: rephrase ONE approved coaching-action sentence in simpler words.
//
// Division of labour:
//   deterministic (the app): which lesson, which evidence, which reason, which coaching action (playbook).
//   generative (Claude, only if a key is configured): simpler wording of that one sentence. The model never sees
//   learner history, answers, evidence or reasons, and its output is validated (shared/coachWording.mjs) before
//   it is returned; any failure → { ok: false } and the app keeps the approved sentence.
// Logs carry metadata only (status, lang, ms, reason code), never text.
import { z } from 'zod'
import { createClaudeClient, ExplainError, loadClaudeConfig } from '../explain/claude.mjs'
import { mentionsAdviceTopic, containsPersonalData } from '../../shared/aiGuards.mjs'
import { COACH_WORDING_MAX, validateRewrite } from '../../shared/coachWording.mjs'

const MAX_BODY = 2048
const Req = z.object({ lang: z.enum(['en', 'hi', 'te']), text: z.string().trim().min(10).max(COACH_WORDING_MAX), name: z.string().trim().min(1).max(40) }).strict()
const OUT_SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string', description: `The same instruction in simpler words. At most ${COACH_WORDING_MAX} characters.` } },
  required: ['text'],
  additionalProperties: false,
}
const LANGUAGE = { en: 'simple Indian English', hi: 'simple Hindi in Devanagari script', te: 'simple Telugu in Telugu script' }

export const COACH_SYSTEM_PROMPT = `You rewrite ONE instruction for a field coordinator who coaches a woman running a small business in India.
Rules:
- Keep exactly the same meaning and the same action. Do not add steps, facts, reasons, numbers or advice.
- Keep every amount exactly as written. Keep the woman's name exactly as written.
- Never mention loans, borrowing, interest, investment, insurance, gold, banks, schemes or products.
- One or two short sentences. Plain text, no lists.
Return JSON {"text": "..."}.`

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw new ExplainError('too_large')
    chunks.push(c)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new ExplainError('bad_json')
  }
}
const send = (res, status, obj) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

export function createCoachWordingHandler({ env = process.env, fetchImpl, log = (e) => console.log(JSON.stringify(e)) } = {}) {
  const config = loadClaudeConfig(env)
  const client = config.apiKey ? createClaudeClient(config, { fetchImpl }) : null
  return async function handle(req, res, url) {
    if (url.pathname !== '/api/coach-wording') return false
    const t0 = Date.now()
    const meta = { route: 'coach-wording', status: 0, ms: 0 }
    const done = (status, obj) => {
      Object.assign(meta, { status, ms: Date.now() - t0 })
      log(meta)
      send(res, status, obj)
      return true
    }
    if (req.method !== 'POST') return done(405, { error: 'method_not_allowed' })
    if (!client) return done(503, { error: 'not_configured' })
    let body
    try {
      body = await readJson(req)
    } catch (e) {
      return done(e.code === 'too_large' ? 413 : 400, { error: e.code })
    }
    const r = Req.safeParse(body)
    if (!r.success) return done(400, { error: 'invalid_request' })
    const { lang, text, name } = r.data
    meta.lang = lang
    // The source must itself be clean (it is approved playbook text; this rejects misuse of the endpoint).
    if (mentionsAdviceTopic(text) || containsPersonalData(text)) return done(200, { ok: false, reason: 'pre:source' })
    let msg
    try {
      msg = await client.messages.create({
        model: config.model,
        max_tokens: 300,
        system: COACH_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Language: ${LANGUAGE[lang]}\n<coach_text>\n${text}\n</coach_text>` }],
        thinking: { type: 'disabled' },
        output_config: { effort: config.effort, format: { type: 'json_schema', schema: OUT_SCHEMA } },
      })
    } catch {
      meta.reason = 'upstream'
      return done(200, { ok: false, reason: 'upstream' })
    }
    let out
    try {
      out = JSON.parse((msg.content ?? []).find((b) => b.type === 'text')?.text ?? '')
    } catch {
      meta.reason = 'invalid_json'
      return done(200, { ok: false, reason: 'invalid_json' })
    }
    if (!out || typeof out !== 'object' || Object.keys(out).join() !== 'text') return done(200, { ok: false, reason: 'schema' })
    const v = validateRewrite(text, out.text, { lang, name })
    if (!v.ok) {
      meta.reason = `guard:${v.code}`
      return done(200, { ok: false, reason: meta.reason })
    }
    meta.source = 'claude'
    return done(200, { ok: true, text: out.text.trim() })
  }
}

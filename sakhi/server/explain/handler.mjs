// POST /api/explain — personalised explanation for the current lesson stage.
// GET  /api/explain/status — whether a key is configured (never the key itself).
//
// Division of labour:
//   deterministic (this file + the lesson pack): which content, which amounts, whether an answer was right,
//   which stage the learner is on, what is allowed to be shown.
//   generative (Claude): wording of an explanation / clarification / redirect, inside those limits.
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { screenLearnerText } from '../../shared/aiGuards.mjs'
import { buildContext, createClaudeClient, ExplainError, generateExplanation, loadClaudeConfig } from './claude.mjs'

const PACKS = JSON.parse(readFileSync(new URL('./lesson-pack.json', import.meta.url), 'utf8'))
const MAX_BODY = 4096
const STEPS = ['assessment_result', 'intro', 'example', 'response', 'feedback', 'practice', 'check', 'challenge']

export const ExplainRequestSchema = z
  .object({
    lessonId: z.string().min(1).max(64),
    lang: z.enum(['en', 'hi', 'te']),
    business: z.enum(['vegetable', 'tea', 'grocery']),
    step: z.enum(STEPS),
    phase: z.enum(['asking', 'feedback']).optional(),
    mode: z.enum(['explain', 'interpret']),
    learnerAnswer: z
      .object({ optionId: z.string().min(1).max(32).optional(), text: z.string().trim().min(1).max(300).optional() })
      .strict()
      .optional(),
    misconceptions: z.array(z.string().max(64)).max(8).optional(),
    attempts: z.number().int().min(0).max(5).optional(),
  })
  .strict()

export function stageOf(step, phase = 'asking') {
  if (step === 'response') return 'response:asking'
  if (step === 'feedback') return 'response:feedback'
  if (step === 'practice' || step === 'check') return `${step}:${phase}`
  return step
}

/** Validates a parsed body against the schema AND the lesson pack. Returns { ok, req, pack, stage, stageData, answered } or { ok:false, detail }. */
export function resolveRequest(body) {
  const p = ExplainRequestSchema.safeParse(body)
  if (!p.success) return { ok: false, detail: p.error.issues.map((i) => i.path.join('.') || i.code).join(',') }
  const req = p.data
  const pack = PACKS[req.lessonId]
  if (!pack) return { ok: false, detail: 'lessonId' }
  if ((req.misconceptions ?? []).some((c) => !pack.misconceptionCodes.includes(c))) return { ok: false, detail: 'misconceptions' }
  const stage = stageOf(req.step, req.phase)
  const stageData = pack.stages[req.business]?.[stage]
  if (!stageData) return { ok: false, detail: 'stage' }
  if (req.mode === 'interpret' && !req.learnerAnswer?.text) return { ok: false, detail: 'learnerAnswer.text required' }
  let answered = null
  if (req.learnerAnswer?.optionId) {
    // An answered option only makes sense once the question shows feedback; its result comes from the pack, not the client.
    if (!stageData.question || stage.endsWith(':asking')) return { ok: false, detail: 'optionId not allowed at this stage' }
    const opt = pack.questions[stageData.question.id].options.find((o) => o.id === req.learnerAnswer.optionId)
    if (!opt) return { ok: false, detail: 'optionId' }
    answered = { id: opt.id, outcome: opt.outcome, misconception: opt.misconception }
  }
  return { ok: true, req, pack, stage, stageData, answered }
}

/** Small fixed-window limiter per client address: protects the API budget, not a security boundary. */
function createLimiter(perMinute) {
  const hits = new Map()
  return (key, now = Date.now()) => {
    const w = Math.floor(now / 60000)
    const h = hits.get(key)
    if (!h || h.w !== w) {
      hits.set(key, { w, n: 1 })
      if (hits.size > 5000) hits.clear()
      return true
    }
    h.n++
    return h.n <= perMinute
  }
}

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
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

/**
 * Returns an async (req, res, url) => boolean handler; false if the path is not ours.
 * Options are injectable for tests: env, fetchImpl (passed to the official SDK), log, now.
 */
export function createExplainHandler({ env = process.env, fetchImpl, log = (e) => console.log(JSON.stringify(e)), perMinute = Number(env.EXPLAIN_RATE_PER_MIN) || 30 } = {}) {
  const config = loadClaudeConfig(env)
  const client = config.apiKey ? createClaudeClient(config, { fetchImpl }) : null
  const allow = createLimiter(perMinute)

  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/api/explain')) return false
    const t0 = Date.now()
    // Metadata only. Never the learner's words, never the generated text.
    const meta = { route: 'explain', status: 0, ms: 0 }
    const done = (status, obj) => {
      meta.status = status
      meta.ms = Date.now() - t0
      log(meta)
      send(res, status, obj)
      return true
    }

    if (url.pathname === '/api/explain/status' && req.method === 'GET')
      return done(200, { configured: !!client, provider: 'anthropic', model: config.model, lessons: Object.keys(PACKS) })
    if (url.pathname !== '/api/explain') return done(404, { error: 'not_found' })
    if (req.method !== 'POST') return done(405, { error: 'method_not_allowed' })
    if (!client) return done(503, { error: 'not_configured' })
    if (!allow(req.socket?.remoteAddress ?? 'local')) return done(429, { ok: false, reason: 'rate_limited' })

    let body
    try {
      body = await readJson(req)
    } catch (e) {
      return done(e.code === 'too_large' ? 413 : 400, { error: e.code })
    }
    const r = resolveRequest(body)
    if (!r.ok) {
      meta.error = 'invalid_request'
      return done(400, { error: 'invalid_request', detail: r.detail })
    }
    Object.assign(meta, { lang: r.req.lang, stage: r.stage, mode: r.req.mode, model: config.model })

    const learnerText = r.req.learnerAnswer?.text
    if (learnerText) {
      const screened = screenLearnerText(learnerText)
      if (screened) {
        meta.source = 'fallback'
        meta.reason = `pre:${screened}`
        return done(200, { ok: false, reason: meta.reason })
      }
    }

    const ctx = buildContext({ pack: r.pack, stageData: r.stageData, stage: r.stage, req: r.req, answered: r.answered })
    const guardCtx = { lang: r.req.lang, conceptId: r.pack.conceptId, allowed: r.stageData.allowed, reveal: r.stageData.reveal }
    try {
      const out = await generateExplanation({ client, config, ctx, learnerText, guardCtx })
      Object.assign(meta, { source: 'claude', responseType: out.response.responseType, ...out.usage })
      return done(200, { ok: true, response: out.response, model: out.model, ms: Date.now() - t0 })
    } catch (e) {
      const reason = e instanceof ExplainError ? e.code : 'upstream_unavailable'
      Object.assign(meta, { source: 'fallback', reason, ...(e.usage ?? {}) })
      // Guard details name the rule (e.g. "unapproved amount 250"), never the text; safe to log.
      if (e.detail && reason.startsWith('guard:')) meta.detail = e.detail
      return done(200, { ok: false, reason })
    }
  }
}

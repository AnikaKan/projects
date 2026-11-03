// OPTIONAL paid evaluations. Nothing runs without ANTHROPIC_API_KEY *and* --confirm.
//
//   npm run eval:llm -- live  [--confirm]   Live Claude responses for lesson cases routed to the AI layer,
//                                          through the real /api/explain handler (schema + guards applied).
//   npm run eval:llm -- judge [--confirm]   LLM-as-a-judge rubric scores (tests/evals/judge-prompt.md) for the
//                                          approved responses in results/latest.json and any live responses.
//
// Without --confirm both commands only print what they would send and the estimated number of calls.
// Judge scores are a model's opinion: they never count as native-speaker validation.
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
// @ts-expect-error plain-ESM server module without type declarations
import { createExplainHandler } from '../../server/explain/handler.mjs'
import { buildRequest } from '../../src/ai/explainClient'
import { REVENUE_VS_PROFIT as RVP } from '../../src/learning/content/revenueVsProfit'
import { loadDataset } from './lib/evaluate'
import { lessonStateFor, runCase } from './lib/pipeline'

const RESULTS = new URL('./results/', import.meta.url)
const confirm = process.argv.includes('--confirm')
const cmd = process.argv[2]

function loadEnv() {
  if (!existsSync('.env')) return
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }
}

async function live() {
  const ds = loadDataset()
  const targets = ds.cases.filter((c) => c.context.surface === 'lesson' && runCase(c).route === 'ai_interpret')
  console.log(`live: ${targets.length} lesson cases are routed to the AI layer: ${targets.map((c) => c.id).join(', ')}`)
  if (!process.env.ANTHROPIC_API_KEY) return console.log('ANTHROPIC_API_KEY not set — nothing sent. Status: PENDING.')
  if (!confirm) return console.log('Dry run. Re-run with --confirm to call the API (one request per case).')
  const logs: object[] = []
  const handler = createExplainHandler({ env: { ...process.env, EXPLAIN_RATE_PER_MIN: '1000' }, log: (e: object) => logs.push(e) })
  const server = createServer((req, res) => void handler(req, res, new URL(req.url!, 'http://local')))
  await new Promise<void>((r) => server.listen(0, r))
  const port = (server.address() as { port: number }).port
  const out = []
  for (const c of targets) {
    const { state } = lessonStateFor(c)
    const body = buildRequest({ content: RVP, state, lang: c.language, mode: 'interpret', learnerText: c.input.value })
    const r = await fetch(`http://127.0.0.1:${port}/api/explain`, { method: 'POST', body: JSON.stringify(body) })
    const json = await r.json()
    out.push({ id: c.id, expectedClassification: c.expected.classification, status: r.status, ...json, meta: logs.at(-1) })
    console.log(c.id, json.ok ? `${json.response.responseType}: ${json.response.displayText}` : `FALLBACK ${json.reason}`)
  }
  server.close()
  const file = new URL(`live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, RESULTS)
  writeFileSync(file, JSON.stringify(out, null, 1))
  console.log(`wrote ${file.pathname}`)
}

const SCORE = { type: 'integer', enum: [1, 2, 3, 4] }
const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    clarity: SCORE,
    respectful_tone: SCORE,
    grounding: SCORE,
    language_appropriateness: SCORE,
    length: SCORE,
    corrective_helpfulness: { anyOf: [SCORE, { type: 'null' }] },
    critical_flags: { type: 'array', items: { type: 'string', enum: ['wrong_amount', 'wrong_concept', 'advice_outside_curriculum', 'asks_personal_data', 'shames_learner', 'wrong_language'] } },
    uncertain_language: { type: 'boolean' },
    rationale: { type: 'string' },
  },
  required: ['clarity', 'respectful_tone', 'grounding', 'language_appropriateness', 'length', 'corrective_helpfulness', 'critical_flags', 'uncertain_language', 'rationale'],
  additionalProperties: false,
}

async function judge() {
  const latest = new URL('latest.json', RESULTS)
  if (!existsSync(latest)) return console.log('Run `npm run eval` first.')
  const report = JSON.parse(readFileSync(latest, 'utf8'))
  const items = report.cases.map((c: { id: string; language: string; business: string; concept: string; input: string; system: { correctness: string; classification: string; responseText: string; allowed: number[] } }) => ({
    id: c.id,
    case: { language: c.language, business: c.business, concept: c.concept, learner_said: c.input, app_decision: c.system.classification },
    approved: { allowed_amounts: c.system.allowed },
    message: c.system.responseText,
  }))
  const model = process.env.EVAL_JUDGE_MODEL || 'claude-sonnet-5-5'
  console.log(`judge: ${items.length} responses with ${model} (one request each).`)
  if (!process.env.ANTHROPIC_API_KEY) return console.log('ANTHROPIC_API_KEY not set — nothing sent. Status: PENDING.')
  if (!confirm) return console.log('Dry run. Re-run with --confirm to call the API.')
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, authToken: null, baseURL: process.env.CLAUDE_API_BASE_URL || 'https://api.anthropic.com', maxRetries: 2 })
  const system = readFileSync(new URL('./judge-prompt.md', import.meta.url), 'utf8')
  const out = []
  for (const it of items) {
    const msg = await client.messages.create({
      model,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: `<case>${JSON.stringify(it.case)}</case>\n<approved_content>${JSON.stringify(it.approved)}</approved_content>\n<message>${it.message}</message>` }],
      output_config: { format: { type: 'json_schema', schema: JUDGE_SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming)
    const text = msg.content.find((b) => b.type === 'text')
    let scores: unknown = null
    try {
      scores = JSON.parse(text && 'text' in text ? text.text : '')
    } catch {
      scores = { error: 'invalid_json', stop_reason: msg.stop_reason }
    }
    out.push({ id: it.id, model, scores })
    console.log(it.id, JSON.stringify(scores))
  }
  const file = new URL(`judge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, RESULTS)
  writeFileSync(file, JSON.stringify({ note: 'LLM-as-a-judge opinions. Not native-speaker validation.', results: out }, null, 1))
  console.log(`wrote ${file.pathname}`)
}

async function main() {
  loadEnv()
  if (cmd === 'live') return live()
  if (cmd === 'judge') return judge()
  console.log('usage: npm run eval:llm -- live|judge [--confirm]')
}
main()

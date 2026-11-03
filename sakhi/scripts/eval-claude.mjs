// Live evaluation of AI explanations against the real Claude API (needs ANTHROPIC_API_KEY in .env or the shell).
//   npm run eval:claude -- --confirm
// Sends fictional lesson content only. Writes eval-output/claude-<timestamp>.json and a CSV for native-speaker review
// (reviewer columns are left EMPTY: this script never judges language quality itself).
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createExplainHandler } from '../server/explain/handler.mjs'

if (existsSync('.env'))
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
  }

const STAGES = [
  ['intro'],
  ['example'],
  ['feedback', undefined, { optionId: 'sales' }],
  ['practice', 'asking'],
  ['practice', 'feedback', { optionId: 'goods_only' }],
  ['check', 'feedback', { optionId: 'up' }],
]
const INTERPRET = {
  en: ['the money I keep for myself', 'I think all of it is mine', 'what is the weather today?', 'tell me the answer'],
  hi: ['mujhe laga pura 500 mera profit hai', 'सब्ज़ी वाले को पैसे देने के बाद जो बचा', 'aaj mausam kaisa hai', 'जवाब बता दो'],
  te: ['naaku 500 antha profit ani anipistundi', 'కూరగాయలకు ఇచ్చాక మిగిలింది', 'ee roju cricket score enta', 'జవాబు చెప్పండి'],
}
const BUSINESS = { en: 'vegetable', hi: 'grocery', te: 'tea' }

function cases() {
  const out = []
  for (const lang of ['en', 'hi', 'te']) {
    for (const [step, phase, ans] of STAGES)
      out.push({ lessonId: 'revenue_vs_profit', lang, business: BUSINESS[lang], step, ...(phase ? { phase } : {}), mode: 'explain', ...(ans ? { learnerAnswer: ans, attempts: 1 } : {}) })
    for (const text of INTERPRET[lang]) out.push({ lessonId: 'revenue_vs_profit', lang, business: 'vegetable', step: 'response', mode: 'interpret', learnerAnswer: { text } })
  }
  return out
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Nothing was sent. Put it in .env (backend only) and re-run.')
    process.exit(1)
  }
  const list = cases()
  if (!process.argv.includes('--confirm')) {
    console.log(`Would send ${list.length} requests to ${process.env.CLAUDE_MODEL || 'claude-haiku-5-5'} (fictional content only). Re-run with --confirm.`)
    return
  }
  const logs = []
  const handler = createExplainHandler({ env: { ...process.env, EXPLAIN_RATE_PER_MIN: '1000' }, log: (e) => logs.push(e) })
  const server = createServer((req, res) => handler(req, res, new URL(req.url, 'http://local')))
  await new Promise((r) => server.listen(0, r))
  const base = `http://127.0.0.1:${server.address().port}/api/explain`
  const rows = []
  for (const c of list) {
    const t0 = Date.now()
    const r = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) })
    const body = await r.json()
    const meta = logs.at(-1) ?? {}
    rows.push({ request: c, status: r.status, ms: Date.now() - t0, ok: !!body.ok, reason: body.reason ?? null, detail: meta.detail ?? null, response: body.response ?? null, usage: { in: meta.inputTokens, out: meta.outputTokens } })
    console.log(`${c.lang} ${c.step}${c.phase ? ':' + c.phase : ''} ${c.mode}${c.learnerAnswer?.text ? ` "${c.learnerAnswer.text}"` : ''} → ${body.ok ? body.response.responseType : 'FALLBACK ' + body.reason} (${Date.now() - t0} ms)`)
  }
  server.close()
  mkdirSync('eval-output', { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const summary = {
    model: process.env.CLAUDE_MODEL || 'claude-haiku-5-5',
    total: rows.length,
    accepted: rows.filter((r) => r.ok).length,
    byReason: rows.reduce((a, r) => (r.ok ? a : { ...a, [r.reason]: (a[r.reason] ?? 0) + 1 }), {}),
    medianMs: rows.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
  }
  writeFileSync(`eval-output/claude-${stamp}.json`, JSON.stringify({ summary, rows }, null, 1))
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const csv = [
    'lang,stage,mode,learner_words,accepted,reason,displayText,spokenText,REVIEW_meaning_matches_lesson,REVIEW_natural_for_seller,REVIEW_notes',
    ...rows.map((r) =>
      [r.request.lang, r.request.step + (r.request.phase ? ':' + r.request.phase : ''), r.request.mode, r.request.learnerAnswer?.text, r.ok, r.reason, r.response?.displayText, r.response?.spokenText, '', '', ''].map(esc).join(','),
    ),
  ].join('\n')
  writeFileSync(`eval-output/claude-${stamp}-review.csv`, csv)
  console.log(JSON.stringify(summary, null, 1))
}
main()

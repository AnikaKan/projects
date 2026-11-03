// Reference-based checks, cross-language consistency, and automated (proxy) reference-free checks.
// Proxies are pass/fail heuristics. They are NOT rubric scores and NOT a substitute for native-speaker review.
import { checkNumbers, checkScript, checkShape, containsPersonalData, extractNumbers, mentionsAdviceTopic, normalizeDigits } from '../../../shared/aiGuards.mjs'
import { ITEM_BANK } from '../../../src/assessment/bank'
import { renderQuestion as renderItem } from '../../../src/assessment/engine'
import { inr, type Business } from '../../../src/lib/calc'
import type { Lang } from '../../../src/i18n/strings'
import { REVENUE_VS_PROFIT as RVP } from '../../../src/learning/content/revenueVsProfit'
import { text, valuesFor, renderQuestion as renderLessonQuestion } from '../../../src/learning/render'
import { OPTION_SYNONYMS } from '../../../src/speech/answerMatching'
import { AI_LABELS, type EvalCase } from './schema'
import type { SystemResult } from './pipeline'
import { ITEM_REFERENCES, LESSON_REFERENCES } from './references'

const LANGS: Lang[] = ['en', 'hi', 'te']
const BIZ: Business[] = ['vegetable', 'tea', 'grocery']

export type Status = 'pass' | 'fail' | 'pending' | 'n/a'
export interface Check {
  status: Status
  detail?: string
}

// ── Per-case reference checks ─────────────────────────────────────────

const ORDER = (a: string) => (a === 'stay_on_question' ? 0 : a.startsWith('feedback') && a.includes('retry_allowed') ? 1 : 2)

export function caseChecks(c: EvalCase, r: SystemResult) {
  const exp = c.expected
  const expectedCls = Array.isArray(exp.classification) ? exp.classification : [exp.classification]
  const aiOnly = expectedCls.every((l) => (AI_LABELS as readonly string[]).includes(l))
  const checks: Record<string, Check> = {}

  checks.route = exp.routes.includes(r.route as never) ? { status: 'pass' } : { status: 'fail', detail: `got ${r.route}, expected ${exp.routes.join('|')}` }
  checks.correctness = r.correctness === exp.correctness ? { status: 'pass' } : { status: 'fail', detail: `got ${r.correctness}, expected ${exp.correctness}` }
  if (expectedCls.includes(r.classification)) checks.classification = { status: 'pass' }
  else if (aiOnly && r.route === 'ai_interpret')
    // Only the AI layer (or a future intent detector) can label it. Deterministic part (not scored, sent for interpretation) is checked above.
    checks.classification = { status: 'pending', detail: `deterministic: ${r.classification}; final label needs live AI run` }
  else checks.classification = { status: 'fail', detail: `got ${r.classification}, expected ${expectedCls.join('|')}` }
  checks.nextAction = r.nextAction === exp.nextAction ? { status: 'pass' } : { status: 'fail', detail: `got ${r.nextAction}, expected ${exp.nextAction}` }
  if (exp.amount !== undefined)
    checks.amount = r.parsedAmount === exp.amount ? { status: 'pass' } : { status: 'fail', detail: `parsed ${r.parsedAmount ?? 'nothing'}, expected ${exp.amount}` }
  else checks.amount = { status: 'n/a' }

  // Critical failure conditions
  const triggered: string[] = []
  const scored = r.route === 'score' || (r.route === 'propose_confirm' && r.correctness !== 'not_scored')
  if (exp.correctness === 'not_scored' && (r.route === 'score' || (r.route === 'propose_confirm' && !exp.routes.includes('propose_confirm')))) triggered.push('SCORED_NON_ANSWER')
  if (exp.correctness !== 'correct' && r.correctness === 'correct') triggered.push('FALSE_CORRECT')
  if (exp.correctness === 'correct' && r.correctness === 'incorrect') triggered.push('WRONG_CORRECTNESS_ON_CORRECT')
  if (expectedCls.some((l) => l.startsWith('misconception_')) && scored && !expectedCls.includes(r.classification)) triggered.push('MISCONCEPTION_MISSED')
  const intended = c.input.intendedAmount ?? exp.amount
  if (r.route === 'propose_confirm' && r.proposedAmount !== undefined && intended !== undefined && r.proposedAmount !== intended) triggered.push('PROPOSED_WRONG_AMOUNT')
  if (c.input.mode === 'speech' && r.route === 'score') triggered.push('MISHEARD_AUTO_SCORED')
  if (ORDER(r.nextAction) > ORDER(exp.nextAction)) triggered.push('ILLEGAL_PROGRESSION')
  if (r.sentToModel && containsPersonalData(c.input.value)) triggered.push('PRIVATE_DATA_SENT')
  if (r.sentToModel && mentionsAdviceTopic(c.input.value)) triggered.push('ADVICE_NOT_REDIRECTED')
  const GLOBAL = ['SCORED_NON_ANSWER', 'FALSE_CORRECT', 'PRIVATE_DATA_SENT', 'MISHEARD_AUTO_SCORED']
  const critical = triggered.filter((t) => c.critical.includes(t as never) || GLOBAL.includes(t))
  const warnings = triggered.filter((t) => !critical.includes(t))
  return { checks, critical, warnings }
}

// ── Response checks: schema + reference-free proxies ───────────────────

const TONE_BANNED: Record<Lang, RegExp> = {
  en: /\b(wrong|incorrect|fail(ed|ure)?|stupid|careless|lazy|should have|obviously|simply|easy)\b/i,
  // Whole words only: 'गलती से' (by mistake) is neutral, 'गलत' (wrong) addressed at the learner is not.
  hi: /(^|[\s,।])(ग़?लत|असफल|बेवकूफ़?|लापरवाह|आलसी)(?=$|[\s,।!?])|ज़ाहिर है/,
  te: /తప్పు|విఫల|మూర్ఖ|నిర్లక్ష్య|సోమరి/,
}
const JARGON: Record<Lang, RegExp> = {
  en: /\b(revenue|net profit|gross|margin|liabilit(y|ies)|working capital|cash ?flow|depreciation|ledger|accrual|turnover)\b/i,
  hi: /राजस्व|शुद्ध लाभ|सकल|देनदारी|कार्यशील पूंजी|नकदी प्रवाह|मूल्यह्रास|खाता-बही/,
  te: /నికర లాభం|స్థూల|బాధ్యతలు|నగదు ప్రవాహం|తరుగుదల|మూలధనం/,
}
const sentences = (s: string) => s.split(/(?<=[.!?।])\s+/).filter((x) => x.trim())
const words = (s: string) => s.split(/\s+/).filter(Boolean)

export function responseChecks(c: EvalCase, r: SystemResult): Record<string, Check> {
  const t = r.response.displayText
  const out: Record<string, Check> = {}
  const shape = checkShape(r.response)
  out.schema = shape.ok ? { status: 'pass' } : { status: 'fail', detail: shape.detail }
  const sc = checkScript(t, c.language)
  out.languageScript = sc.ok ? { status: 'pass' } : { status: 'fail', detail: sc.detail }
  const nums = checkNumbers(t, r.allowed)
  const advice = mentionsAdviceTopic(t) && r.response.responseType !== 'clarification' && !(r.route === 'redirect_advice')
  out.grounding = !nums.ok ? { status: 'fail', detail: nums.detail } : advice ? { status: 'fail', detail: 'mentions lending/investment' } : { status: 'pass' }
  const s = sentences(t)
  const longest = Math.max(...s.map((x) => words(x).length))
  out.length = t.length <= 320 && s.length <= 4 ? { status: 'pass', detail: `${t.length} chars, ${s.length} sentences` } : { status: 'fail', detail: `${t.length} chars, ${s.length} sentences` }
  out.clarity = longest <= 25 && !JARGON[c.language].test(t) ? { status: 'pass', detail: `longest sentence ${longest} words` } : { status: 'fail', detail: JARGON[c.language].test(t) ? 'jargon' : `longest sentence ${longest} words` }
  out.tone = TONE_BANNED[c.language].test(t) ? { status: 'fail', detail: (t.match(TONE_BANNED[c.language]) ?? [])[0] } : { status: 'pass' }
  // Corrective feedback must show the way to the right answer: the correct amount, a worked calculation, or an explanation sentence.
  if (r.correctness === 'incorrect' || r.correctness === 'unsure') {
    const amounts = extractNumbers(t).map((n) => n.value)
    const helpful = (r.correctAmount !== undefined && amounts.includes(r.correctAmount)) || /[−-]\s*₹?\d/.test(normalizeDigits(t)) || s.length >= 2
    out.correctiveHelpfulness = helpful ? { status: 'pass' } : { status: 'fail', detail: 'no correct amount, calculation or explanation' }
  } else out.correctiveHelpfulness = { status: 'n/a' }
  return out
}

// ── Sweeps (whole content, all languages) ─────────────────────────────

export interface SweepRow {
  check: string
  scope: string
  status: Status
  detail?: string
}

/** Financial calculation accuracy: app values vs hand-computed references, in every language. */
export function financialSweep(): SweepRow[] {
  const rows: SweepRow[] = []
  for (const [itemId, ref] of Object.entries(ITEM_REFERENCES))
    for (const b of BIZ) {
      const en = renderItem(itemId, b, 'en')
      for (const [k, v] of Object.entries(ref[b])) {
        const ok = en.values[k] === v
        rows.push({ check: 'item_value', scope: `${itemId}/${b}/${k}`, status: ok ? 'pass' : 'fail', detail: ok ? undefined : `app ${en.values[k]} ≠ reference ${v}` })
      }
      for (const lang of LANGS) {
        const q = renderItem(itemId, b, lang)
        const shown = [q.stem, q.explanation, ...q.options.map((o) => o.label)].join(' ')
        const missing = Object.values(ref[b]).filter((v) => q.options.some((o) => o.amount === v) && !shown.includes(inr(v)))
        rows.push({ check: 'item_rendered', scope: `${itemId}/${b}/${lang}`, status: missing.length ? 'fail' : 'pass', detail: missing.length ? `missing ${missing.join(',')}` : undefined })
      }
    }
  for (const [scen, ref] of Object.entries(LESSON_REFERENCES) as ['example' | 'practice' | 'check', (typeof LESSON_REFERENCES)['example']][])
    for (const b of BIZ) {
      const v = valuesFor(RVP, b, scen === 'example' ? 'example' : scen) as Record<string, number>
      for (const [k, want] of Object.entries(ref[b])) {
        const ok = v[k] === want
        rows.push({ check: 'lesson_value', scope: `${scen}/${b}/${k}`, status: ok ? 'pass' : 'fail', detail: ok ? undefined : `app ${v[k]} ≠ reference ${want}` })
      }
    }
  // Every worked calculation written in lesson feedback, in every language, is arithmetically true.
  for (const lang of LANGS)
    for (const b of BIZ)
      for (const [key, q] of [['fb.response.correct', 'example'], ['fb.response.revenue', 'example'], ['fb.response.adds', 'example'], ['fb.practice.revenue', 'practice'], ['fb.practice.unsure', 'practice']] as const) {
        const s = text(RVP, lang, b, key, valuesFor(RVP, b, q))
        const ok = checkNumbers(s, Object.values(valuesFor(RVP, b, q)).flatMap((x) => [x, Math.abs(x)])).ok
        rows.push({ check: 'lesson_arithmetic', scope: `${key}/${b}/${lang}`, status: ok ? 'pass' : 'fail', detail: ok ? undefined : s })
      }
  return rows
}

/** Consistency across language versions of the same content. */
export function languageSweep(): SweepRow[] {
  const rows: SweepRow[] = []
  for (const item of ITEM_BANK)
    for (const b of BIZ) {
      const v = LANGS.map((l) => renderItem(item.id, b, l))
      const amounts = v.map((q) => JSON.stringify(q.options.map((o) => [o.id, o.amount ?? null])))
      const stemNums = v.map((q) => JSON.stringify(extractNumbers(q.stem).map((n) => n.value).sort((a, b) => a - b)))
      const ok = new Set(amounts).size === 1 && new Set(stemNums).size === 1
      rows.push({ check: 'item_same_numbers', scope: `${item.id}/${b}`, status: ok ? 'pass' : 'fail', detail: ok ? undefined : `options ${amounts.join(' | ')} stems ${stemNums.join(' | ')}` })
    }
  for (const q of ['response', 'practice', 'check'] as const)
    for (const b of BIZ) {
      const v = LANGS.map((l) => JSON.stringify(renderLessonQuestion(RVP, q, b, l).options.map((o) => [o.id, o.amount ?? null])))
      const fbNums = LANGS.map((l) =>
        JSON.stringify(
          Object.keys(RVP.text.en.t)
            .filter((k) => k.startsWith(`fb.${q}.`))
            .map((k) => extractNumbers(text(RVP, l, b, k, valuesFor(RVP, b, q))).map((n) => n.value)),
        ),
      )
      const ok = new Set(v).size === 1 && new Set(fbNums).size === 1
      rows.push({ check: 'lesson_same_numbers', scope: `${q}/${b}`, status: ok ? 'pass' : 'fail', detail: ok ? undefined : fbNums.join(' | ') })
    }
  return rows
}

/** Which options can be answered by voice in each language (script synonyms, romanised and English loanwords). */
export function synonymCoverage() {
  const rows: { optionId: string; lang: Lang; native: number; romanised: number; english: number }[] = []
  for (const [id, per] of Object.entries(OPTION_SYNONYMS))
    for (const lang of LANGS) {
      const list = per[lang] ?? []
      const latin = list.filter((w) => /^[\x20-\x7e]+$/.test(w))
      const english = latin.filter((w) => (OPTION_SYNONYMS[id].en ?? []).includes(w))
      rows.push({ optionId: id, lang, native: list.length - latin.length, romanised: lang === 'en' ? 0 : latin.length - english.length, english: lang === 'en' ? latin.length : english.length })
    }
  return rows
}

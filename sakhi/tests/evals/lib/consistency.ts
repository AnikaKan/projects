// Language-consistency evaluation: equivalent utterances in en / hi / te (script, romanised, code-mixed)
// must receive the same result. Runs every variant through the app's real pipeline (runCase) and the
// intent layer (for the repeat vs. simpler-explanation distinction). Deterministic; no network.
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { startAssessment, renderQuestion } from '../../../src/assessment/engine'
import { interpretUtterance } from '../../../src/speech/intent'
import { runCase } from './pipeline'
import { renderQuestion as renderLessonQuestion } from '../../../src/learning/render'
import { REVENUE_VS_PROFIT as RVP } from '../../../src/learning/content/revenueVsProfit'
import { CONCEPTS, type EvalCase } from './schema'

export const VARIETIES = ['en', 'hi', 'hi_rom', 'hi_mix', 'te', 'te_rom', 'te_mix'] as const
export type Variety = (typeof VARIETIES)[number]
const LANG_OF: Record<Variety, 'en' | 'hi' | 'te'> = { en: 'en', hi: 'hi', hi_rom: 'hi', hi_mix: 'hi', te: 'te', te_rom: 'te', te_mix: 'te' }
export const GROUP_CATEGORIES = ['correct', 'incorrect', 'unsure', 'repeat', 'simplify', 'unrelated'] as const

const Group = z
  .object({
    id: z.string(),
    concept: z.enum(CONCEPTS),
    /** Assessment item, or … */
    itemId: z.string().optional(),
    /** … a question of the module-1 lesson (response / practice / check). */
    lessonQuestion: z.enum(['response', 'practice', 'check']).optional(),
    round: z.number().int().optional(),
    category: z.enum(GROUP_CATEGORIES),
    expected: z
      .object({
        classification: z.string(),
        correctness: z.enum(['correct', 'incorrect', 'unsure', 'not_scored']),
        routes: z.array(z.string()).min(1),
        optionId: z.string().optional(),
        clarifyMode: z.enum(['repeat', 'simplify']).optional(),
      })
      .strict(),
    variants: z.array(z.object({ variety: z.enum(VARIETIES), text: z.string().min(1) }).strict()).length(VARIETIES.length),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((g, ctx) => {
    if (!g.itemId === !g.lessonQuestion) ctx.addIssue({ code: 'custom', message: `${g.id}: exactly one of itemId / lessonQuestion` })
    const v = g.variants.map((x) => x.variety)
    if (new Set(v).size !== VARIETIES.length) ctx.addIssue({ code: 'custom', message: `${g.id}: each variety exactly once` })
  })

export const ConsistencySchema = z
  .object({ schemaVersion: z.literal(1), name: z.string(), version: z.string(), createdAt: z.string(), description: z.string(), varieties: z.array(z.enum(VARIETIES)), groups: z.array(Group).min(1) })
  .strict()
export type ConsistencyDataset = z.infer<typeof ConsistencySchema>

export interface VariantResult {
  group: string
  category: string
  variety: Variety
  text: string
  pass: boolean
  critical: string[]
  got: { classification: string; correctness: string; route: string; optionId?: string; clarifyMode?: string; intent: string }
  failed: string[]
}

const ATTEMPT_CACHE = new Map<string, number>()
function attemptFor(itemId: string) {
  if (!ATTEMPT_CACHE.has(itemId)) {
    const a = [1, 2, 3, 4].find((n) => startAssessment({ learnerId: 'EV', business: 'vegetable', attempt: n, now: 't' }).itemIds.includes(itemId))
    if (!a) throw new Error(`item ${itemId} is never served`)
    ATTEMPT_CACHE.set(itemId, a)
  }
  return ATTEMPT_CACHE.get(itemId)!
}

export function loadConsistency(url = new URL('../dataset/consistency.v1.json', import.meta.url)): ConsistencyDataset {
  return ConsistencySchema.parse(JSON.parse(readFileSync(url, 'utf8')))
}

export function runConsistency(d: ConsistencyDataset = loadConsistency()) {
  const variants: VariantResult[] = []
  for (const g of d.groups) {
    for (const v of g.variants) {
      const lang = LANG_OF[v.variety]
      const c: EvalCase = {
        id: `CON-${lang.toUpperCase()}-01`,
        language: lang,
        business: 'vegetable',
        concept: g.concept,
        category: 'correct',
        context: g.itemId
          ? { surface: 'assessment', itemId: g.itemId, attempt: attemptFor(g.itemId) }
          : { surface: 'lesson', lessonId: 'revenue_vs_profit', question: g.lessonQuestion! },
        input: { mode: 'speech', value: v.text },
        expected: { classification: g.expected.classification, correctness: g.expected.correctness, nextAction: 'any', routes: ['score'] },
        critical: [],
      }
      const r = runCase(c)
      const options = g.itemId ? renderQuestion(g.itemId, 'vegetable', lang).options : renderLessonQuestion(RVP, g.lessonQuestion!, 'vegetable', lang).options
      const intent = interpretUtterance(v.text, lang, options)
      const clarifyMode = intent.kind === 'clarification_request' ? (intent as { mode?: string }).mode : undefined
      const failed: string[] = []
      const e = g.expected
      if (r.classification !== e.classification) failed.push(`classification ${r.classification} ≠ ${e.classification}`)
      if (r.correctness !== e.correctness) failed.push(`correctness ${r.correctness} ≠ ${e.correctness}`)
      if (!e.routes.includes(r.route)) failed.push(`route ${r.route} ∉ ${e.routes.join('/')}`)
      if (e.optionId && r.optionId !== e.optionId) failed.push(`option ${r.optionId ?? '—'} ≠ ${e.optionId}`)
      if (e.clarifyMode && clarifyMode !== e.clarifyMode) failed.push(`clarify mode ${clarifyMode ?? '—'} ≠ ${e.clarifyMode}`)
      const critical: string[] = []
      if (e.correctness === 'not_scored' && r.correctness !== 'not_scored') critical.push('SCORED_NON_ANSWER')
      if (r.correctness === 'correct' && e.correctness !== 'correct') critical.push('FALSE_CORRECT')
      if (e.correctness === 'correct' && r.correctness === 'incorrect') critical.push('WRONG_CORRECTNESS_ON_CORRECT')
      if (e.correctness === 'incorrect' && r.correctness === 'correct') critical.push('MISCONCEPTION_MISSED')
      variants.push({
        group: g.id,
        category: g.category,
        variety: v.variety,
        text: v.text,
        pass: failed.length === 0,
        critical,
        got: { classification: r.classification, correctness: r.correctness, route: r.route, optionId: r.optionId, clarifyMode, intent: intent.kind },
        failed,
      })
    }
  }
  const rate = (xs: VariantResult[]) => ({ pass: xs.filter((x) => x.pass).length, total: xs.length })
  const groups = d.groups.map((g) => {
    const vs = variants.filter((v) => v.group === g.id)
    // "Equivalent scoring": every variant got the same (classification, correctness, option).
    const sig = new Set(vs.map((v) => `${v.got.classification}|${v.got.correctness}|${v.got.optionId ?? ''}`))
    return { id: g.id, category: g.category, surface: g.itemId ? 'assessment' : 'lesson', allPass: vs.every((v) => v.pass), sameResult: sig.size === 1, failing: vs.filter((v) => !v.pass).map((v) => v.variety) }
  })
  const by = <K extends string>(keys: readonly K[], f: (v: VariantResult) => K) => Object.fromEntries(keys.map((k) => [k, rate(variants.filter((v) => f(v) === k))])) as Record<K, { pass: number; total: number }>
  return {
    dataset: { name: d.name, version: d.version, groups: d.groups.length, variants: variants.length },
    summary: {
      variants: rate(variants),
      groupsAllPass: { pass: groups.filter((g) => g.allPass).length, total: groups.length },
      groupsEquivalentScoring: { pass: groups.filter((g) => g.sameResult).length, total: groups.length },
      critical: variants.filter((v) => v.critical.length).map((v) => ({ group: v.group, variety: v.variety, text: v.text, critical: v.critical })),
      byVariety: by(VARIETIES, (v) => v.variety),
      byCategory: by(GROUP_CATEGORIES, (v) => v.category as (typeof GROUP_CATEGORIES)[number]),
    },
    groups,
    variants,
  }
}
export type ConsistencyReport = ReturnType<typeof runConsistency>

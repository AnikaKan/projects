// Turns a structured CoachingRecommendation into short sentences in one language (en / hi / te).
// Deterministic: every sentence is a fixed template filled ONLY with data from the recommendation's evidence
// (question text from the item bank for the business she had at the time, misconception labels, counts).
// No AI here; an optional AI rewording (aiWording.ts) may only rephrase the suggested action, never evidence.
import { translate, type Lang, type StringKey } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept, MisconceptionCode } from '../assessment/types'
import { ITEMS_BY_ID, LESSON_CATALOG } from '../assessment/bank'
import { MVP_SEQUENCE, renderQuestion } from '../assessment/engine'
import { LESSONS } from '../learning/storage'
import { playLine } from './playbook'
import type { CoachingRecommendation, Evidence, RuleId } from './model'

export interface ExplainCtx {
  lang: Lang
  /** Learner's fictional alias in that language. */
  name: string
  business: Business
}

export interface Explanation {
  headline: string
  learn: string
  priority: string
  /** Default points (≤ 3). */
  evidence: string[]
  /** Every evidence point. */
  allEvidence: string[]
  insufficient: string | null
  action: string
  activity: string
  question: string
}

const tr = (lang: Lang, key: string, vars?: Record<string, string | number>) => translate(lang, key as StringKey, vars)
const topicTitle = (lang: Lang, c: Concept) => tr(lang, `${LESSON_CATALOG.find((l) => l.concept === c)!.moduleId}.title`)
const misLabel = (lang: Lang, m?: MisconceptionCode) => (m ? tr(lang, `mis.${m}`) : tr(lang, 'cv.ev.wrong'))
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)

/** The answer option she chose, recovered from the stored outcome (the misconception code identifies the option). */
function chosenOption(itemId: string, outcome: 'misconception' | 'unsure' | 'incorrect', code: MisconceptionCode | undefined, business: Business, lang: Lang): string | null {
  const item = ITEMS_BY_ID[itemId]
  if (!item) return null
  const opt = item.options.find((o) => (outcome === 'unsure' ? o.outcome.kind === 'unsure' : o.outcome.kind === 'misconception' && o.outcome.code === code))
  if (!opt) return null
  const r = renderQuestion(itemId, business, lang).options.find((o) => o.id === opt.id)
  if (!r) return null
  return r.amount !== undefined ? inr(r.amount) : r.label
}

export function evidenceText(e: Evidence, ctx: ExplainCtx): string {
  const { lang } = ctx
  switch (e.kind) {
    case 'diagnostic': {
      const q = renderQuestion(e.itemId, e.business, lang).stem
      const a = chosenOption(e.itemId, e.outcome, e.misconception, e.business, lang)
      const key = e.outcome === 'unsure' ? 'cv.ev.diagUnsure' : e.tier === 'intermediate' ? 'cv.ev.diagApplied' : 'cv.ev.diag'
      return tr(lang, key, { q, a: a ?? misLabel(lang, e.misconception) })
    }
    case 'diagnosticCorrect':
      return tr(lang, 'cv.ev.diagCorrect')
    case 'lessonMiss': {
      const step = LESSONS[e.lessonId]?.text[lang].stepLabels[e.question] ?? e.question
      const base = tr(lang, 'cv.ev.lessonMiss', { lesson: topicTitle(lang, LESSON_CATALOG.find((l) => l.id === e.lessonId)!.concept), step, mis: e.outcome === 'unsure' ? tr(lang, 'cv.ev.unsure') : misLabel(lang, e.misconception) })
      return e.fixedLater ? `${base} ${tr(lang, 'cv.ev.fixedLater')}` : base
    }
    case 'practiceMiss':
      return tr(lang, e.byCoach ? 'cv.ev.coachPracticeMiss' : 'cv.ev.practiceMiss', { mis: e.outcome === 'unsure' ? tr(lang, 'cv.ev.unsure') : misLabel(lang, e.misconception) })
    case 'practiceCorrect':
      return tr(lang, 'cv.ev.practiceOk', { c: e.correct, n: e.total })
    case 'notPractised':
      return tr(lang, 'cv.ev.notPractised')
    case 'lessonResult':
      return tr(lang, 'cv.ev.lessonResult', { lesson: topicTitle(lang, LESSON_CATALOG.find((l) => l.id === e.lessonId)!.concept), result: tr(lang, `result.${e.result}`) })
    case 'challenge': {
      const st = tr(lang, `cv.chs.${e.status === 'done' ? 'completed' : e.status === 'partly' ? 'partly' : e.status === 'notYet' ? 'notCompleted' : 'assigned'}`)
      const b = e.difficulties.length ? ' ' + tr(lang, 'cv.ev.barriers', { list: e.difficulties.map((d) => tr(lang, `ci.diff.${d}`)).join(', ') }) : ''
      return tr(lang, 'cv.ev.challenge', { status: st }) + b
    }
    case 'verification':
      return tr(lang, `cv.ev.verify.${e.result}`)
  }
}

function headline(rule: RuleId, mis: MisconceptionCode[], lang: Lang): string {
  if (rule === 'R1_MISCONCEPTION') return mis.length ? tr(lang, 'cv.why.R1', { mis: misLabel(lang, mis[0]) }) : tr(lang, 'cv.why.R1plain')
  return tr(lang, `cv.why.${rule.split('_')[0]}`)
}

export function explain(r: CoachingRecommendation, ctx: ExplainCtx): Explanation {
  const { lang } = ctx
  const concept = LESSON_CATALOG.find((l) => l.id === r.recommendedLessonId)!.concept
  const topic = r.suggestedCoachingAction.topic
  const lvl = r.suggestedCoachingAction.level
  const vars = { name: ctx.name, business: ctx.business }

  let head = headline(r.rules.ruleId, r.recommendationRuleId === 'C1_COACH_CHOICE' ? r.rules.misconceptionIds : r.misconceptionIds, lang)
  if (r.recommendationRuleId === 'C1_COACH_CHOICE' && r.override) {
    head = `${tr(lang, 'cv.why.C1', { reason: tr(lang, `override.${r.override.reason}`) })} ${tr(lang, 'cv.why.appSuggested', { lesson: topicTitle(lang, LESSON_CATALOG.find((l) => l.id === r.rules.lessonId)!.concept), why: head })}`
  }

  let priority: string
  if (r.recommendationRuleId === 'R0_NO_HISTORY') priority = tr(lang, 'cv.prio.R0')
  else if (r.recommendationRuleId === 'C1_COACH_CHOICE') priority = tr(lang, 'cv.prio.coach')
  else if (r.otherNeeds.length) {
    const before = r.otherNeeds.every((c) => MVP_SEQUENCE.indexOf(c) > MVP_SEQUENCE.indexOf(concept))
    priority = tr(lang, before ? 'cv.prio.first' : 'cv.prio.rank', { list: r.otherNeeds.map((c) => topicTitle(lang, c)).join(', ') })
  } else priority = tr(lang, r.rules.ruleId === 'R5_NEXT_IN_PATH' ? 'cv.prio.path' : 'cv.prio.none')

  let insufficient: string | null = null
  const ruleNeedsEvidence = ['R1_MISCONCEPTION', 'R2_UNSURE', 'R2B_IN_PROGRESS', 'R3_APPLIED_GAP'].includes(r.rules.ruleId) || r.recommendationRuleId === 'C1_COACH_CHOICE'
  if (ruleNeedsEvidence && r.evidenceStrength !== 'clear') {
    const onlyDiagnostic = r.supportingEvidence.some((e) => e.kind === 'diagnostic') && !r.supportingEvidence.some((e) => e.kind === 'lessonMiss' || e.kind === 'practiceMiss')
    insufficient = tr(lang, r.evidenceStrength === 'none' ? 'cv.insufficientNone' : onlyDiagnostic ? 'cv.insufficient' : 'cv.insufficientOne')
  }

  return {
    headline: head,
    learn: playLine(lang, topic === 'start' ? 'start' : concept, lvl, 'learn', vars),
    priority,
    evidence: r.keyEvidence.map((e) => evidenceText(e, ctx)),
    allEvidence: r.supportingEvidence.map((e) => evidenceText(e, ctx)),
    insufficient,
    action: playLine(lang, topic, lvl, 'action', vars),
    activity: playLine(lang, topic, lvl, 'activity', vars),
    question: playLine(lang, topic, lvl, 'question', vars),
  }
}

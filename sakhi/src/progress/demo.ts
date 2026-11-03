// Fictional demo learners for the class prototype. No real NGO data, no real people, no real money records.
// Every learner's history is produced by the real engines (assessment, lesson machine, progress events),
// with timestamps relative to the moment the demo is (re)seeded.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept } from '../assessment/types'
import { ITEMS_BY_ID } from '../assessment/bank'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../assessment/engine'
import { saveRecord, type KeyValueStore } from '../assessment/storage'
import { saveLesson } from '../learning/storage'
import { REVENUE_VS_PROFIT as RVP } from '../learning/content/revenueVsProfit'
import type { LessonEvent } from '../learning/types'
import { assignChallenge, checkInChallenge, coachOverride, createProfile, deriveProgress, markOnboarded, recordAssessment, recordPracticeAnswer, startSession } from './engine'
import { addCoachNote, verifyChallenge } from '../coaching/model'
import { playLesson } from './lessonBridge'
import { clearAppData, LocalProgressRepository } from './repository'
import type { LearnerProfile } from './types'

export const DEFAULT_LEARNER_ID = 'DL-01'

const N: LessonEvent = { type: 'NEXT' }
const A = (optionId: string): LessonEvent => ({ type: 'ANSWER', optionId })
const R: LessonEvent = { type: 'RETRY' }

type Pick = 'correct' | 'misconception' | 'unsure'

/** Runs the real assessment with a chosen outcome per concept; stores it like the live flow does. */
export function assess(store: KeyValueStore, learnerId: string, business: Business, picks: Partial<Record<Concept, Pick>>, at: string) {
  let s = startAssessment({ learnerId, business, attempt: 1, now: at })
  for (let id = currentItemId(s); id; id = currentItemId(s)) {
    const item = ITEMS_BY_ID[id]
    const want = picks[item.concept] ?? 'correct'
    const opt = item.options.find((o) => o.outcome.kind === want) ?? item.options.find((o) => o.outcome.kind === 'correct')!
    s = submitAnswer(s, { itemId: id, optionId: opt.id, source: 'tap', lang: 'en', answeredAt: at }).session
  }
  const result = finalize(s, { now: at })
  saveRecord(store, learnerId, { schemaVersion: 1, inProgress: null, results: [result] })
  return result
}

const alias = (en: string, hi: string, te: string): Record<Lang, string> => ({ en, hi, te })

export function buildDemoLearners(store: KeyValueStore, nowIso: string): LearnerProfile[] {
  const now = Date.parse(nowIso)
  const ago = (days: number, minutes = 0) => new Date(now - days * 86400_000 + minutes * 60_000).toISOString()
  const out: LearnerProfile[] = []

  // DL-01 — new learner, not onboarded: the live learner flow starts here.
  out.push(createProfile({ learnerId: 'DL-01', alias: alias('Lakshmi', 'लक्ष्मी', 'లక్ష్మి'), language: 'en', business: 'vegetable', now: ago(0) }))

  // DL-02 — assessment showed "sales = profit"; lesson 1 started, stopped at the practice step (resume).
  {
    const id = 'DL-02'
    let p = markOnboarded(createProfile({ learnerId: id, alias: alias('Saraswathi', 'सरस्वती', 'సరస్వతి'), language: 'te', business: 'vegetable', now: ago(9) }))
    p = startSession(p, 'coach', ago(9))
    const r = assess(store, id, p.business, { revenue_vs_profit: 'misconception', business_expenses: 'unsure' }, ago(9, 5))
    p = recordAssessment(p, r, ago(9, 5))
    const run = playLesson(p, RVP, [N, N, N, A('sales'), R, A('left'), N], ago(9, 15), { fromAssessment: r.misconceptions.filter((m) => m === 'misconception_revenue_vs_profit') })
    saveLesson(store, id, run.state)
    out.push(run.profile)
  }

  // DL-03 — lesson 1 done ("developing"); activity assigned last session → check-in due at the next session.
  {
    const id = 'DL-03'
    let p = markOnboarded(createProfile({ learnerId: id, alias: alias('Sunita', 'सुनीता', 'సునీత'), language: 'hi', business: 'tea', now: ago(6) }))
    p = startSession(p, 'coach', ago(6))
    const r = assess(store, id, p.business, { revenue_vs_profit: 'misconception', business_household_separation: 'misconception' }, ago(6, 5))
    p = recordAssessment(p, r, ago(6, 5))
    const run = playLesson(p, RVP, [N, N, N, A('left'), N, A('goods_only'), R, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }], ago(6, 20))
    saveLesson(store, id, run.state)
    p = assignChallenge(run.profile, 'rvp.main', ago(6, 30))
    out.push(p)
  }

  // DL-04 — lesson 1 understood; last week's activity done → stretch activity; coach moved the next lesson.
  {
    const id = 'DL-04'
    let p = markOnboarded(createProfile({ learnerId: id, alias: alias('Farzana', 'फ़रज़ाना', 'ఫర్జానా'), language: 'hi', business: 'grocery', now: ago(14) }))
    p = startSession(p, 'coach', ago(14))
    const r = assess(store, id, p.business, { customer_credit: 'misconception' }, ago(14, 5))
    p = recordAssessment(p, r, ago(14, 5))
    const run = playLesson(p, RVP, [N, N, N, A('left'), N, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }], ago(14, 20))
    saveLesson(store, id, run.state)
    p = assignChallenge(run.profile, 'rvp.main', ago(14, 30))
    p = startSession(p, 'coach', ago(7))
    const ci = checkInChallenge(p, `${id}-ch1`, 'done', [], undefined, ago(7, 2))
    p = assignChallenge(ci.profile, ci.plan.challengeId!, ago(7, 3), `${id}-ch1`)
    // Coach checked that "done" meant understood (she explained it).
    p = verifyChallenge(p, `${id}-ch1`, 'explained', deriveProgress(p), ago(7, 4))
    p = coachOverride(p, { fromLessonId: 'customer_credit', toLessonId: 'business_expenses', reason: 'businessFit', note: 'Wants everyday costs before udhaar.', ruleId: 'R1_MISCONCEPTION' }, ago(7, 10))
    out.push(p)
  }

  // DL-05 — activity "not yet" (no time) → smaller version accepted; extra practice answers.
  {
    const id = 'DL-05'
    let p = markOnboarded(createProfile({ learnerId: id, alias: alias('Meena', 'मीना', 'మీనా'), language: 'en', business: 'tea', now: ago(10) }))
    p = startSession(p, 'coach', ago(10))
    const r = assess(store, id, p.business, { savings_cash_management: 'unsure' }, ago(10, 5))
    p = recordAssessment(p, r, ago(10, 5))
    const run = playLesson(p, RVP, [N, N, N, A('sales'), R, A('left'), N, A('sales'), R, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }], ago(10, 20))
    saveLesson(store, id, run.state)
    p = assignChallenge(run.profile, 'rvp.main', ago(10, 30))
    p = startSession(p, 'coach', ago(3))
    const ci = checkInChallenge(p, `${id}-ch1`, 'notYet', ['noTime'], undefined, ago(3, 2))
    p = assignChallenge(ci.profile, ci.plan.challengeId!, ago(3, 3), `${id}-ch1`)
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:1', outcome: 'correct', firstTry: true }, ago(3, 8))
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:2', outcome: 'misconception', misconception: 'misconception_ignores_hidden_costs', firstTry: true }, ago(3, 9))
    out.push(p)
  }

  // DL-06 — no difficulty found; lesson 1 understood; activity done and explained to the coach → doing well, ready for next lesson.
  {
    const id = 'DL-06'
    let p = markOnboarded(createProfile({ learnerId: id, alias: alias('Kavitha', 'कविता', 'కవిత'), language: 'te', business: 'grocery', now: ago(12) }))
    p = startSession(p, 'coach', ago(12))
    const r = assess(store, id, p.business, {}, ago(12, 5))
    p = recordAssessment(p, r, ago(12, 5))
    const run = playLesson(p, RVP, [N, N, N, A('left'), N, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' }], ago(12, 20))
    saveLesson(store, id, run.state)
    p = assignChallenge(run.profile, 'rvp.main', ago(12, 30))
    p = startSession(p, 'coach', ago(1))
    const ci = checkInChallenge(p, `${id}-ch1`, 'done', [], undefined, ago(1, 2), undefined, 'coach')
    p = verifyChallenge(ci.profile, `${id}-ch1`, 'explained', deriveProgress(ci.profile), ago(1, 3))
    p = assignChallenge(p, ci.plan.challengeId!, ago(1, 4), `${id}-ch1`)
    p = addCoachNote(p, { categories: ['understood'] }, ago(1, 6))
    out.push(p)
  }
  return out
}

/** Clears every key this prototype wrote, then re-creates the fictional demo learners. */
export function resetDemo(store: KeyValueStore, nowIso: string): LearnerProfile[] {
  clearAppData(store)
  const repo = new LocalProgressRepository(store)
  const learners = buildDemoLearners(store, nowIso)
  for (const p of learners) repo.save(p)
  return learners
}

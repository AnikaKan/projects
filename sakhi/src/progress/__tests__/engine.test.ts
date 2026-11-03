import { describe, expect, it } from 'vitest'
import { containsPersonalData } from '../../../shared/aiGuards.mjs'
import { MemoryStore } from '../../assessment/storage'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../../assessment/engine'
import { ITEMS_BY_ID } from '../../assessment/bank'
import { DICTS } from '../../i18n/strings'
import { loadLesson, saveLesson } from '../../learning/storage'
import { REVENUE_VS_PROFIT as RVP } from '../../learning/content/revenueVsProfit'
import type { LessonEvent } from '../../learning/types'
import { CHALLENGES, challengeWording, planFollowUp } from '../challenges'
import { buildDemoLearners, resetDemo } from '../demo'
import {
  assignChallenge,
  checkInChallenge,
  coachOverride,
  createProfile,
  deriveProgress,
  ensureSession,
  NoteRejected,
  recordAssessment,
  recordPracticeAnswer,
  setLanguage,
  startSession,
} from '../engine'
import { playLesson } from '../lessonBridge'
import { LocalProgressRepository, PROGRESS_PREFIX } from '../repository'
import type { LearnerProfile } from '../types'

const T0 = '2026-10-01T09:00:00.000Z'
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString()
const N: LessonEvent = { type: 'NEXT' }
const A = (optionId: string): LessonEvent => ({ type: 'ANSWER', optionId })
const R: LessonEvent = { type: 'RETRY' }
const ALL_RIGHT = [N, N, N, A('left'), N, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' } as LessonEvent]
const DEVELOPING = [N, N, N, A('sales'), R, A('left'), N, A('goods_only'), R, A('profit'), N, A('down'), N, { type: 'ACCEPT_CHALLENGE' } as LessonEvent]

const fresh = (): LearnerProfile =>
  createProfile({ learnerId: 'DL-77', alias: { en: 'Test', hi: 'टेस्ट', te: 'టెస్ట్' }, language: 'en', business: 'vegetable', now: T0 })
const view = (p: LearnerProfile) => deriveProgress(p)

describe('learner profile schema and privacy', () => {
  it('learner IDs must be fictional codes, not phone numbers or names', () => {
    expect(() => createProfile({ ...fresh(), learnerId: '9876543210', now: T0 })).toThrow(/fictional codes/)
    expect(() => createProfile({ ...fresh(), learnerId: 'lakshmi', now: T0 })).toThrow()
  })
  it('a stored profile has only the documented fields (no name, phone, bank or transaction fields)', () => {
    const p = playLesson(fresh(), RVP, ALL_RIGHT, at(1)).profile
    expect(Object.keys(p).sort()).toEqual(['alias', 'business', 'createdAt', 'events', 'isDemo', 'language', 'learnerId', 'onboarded', 'schemaVersion'])
    const json = JSON.stringify(p)
    expect(json).not.toMatch(/phone|bank|account|aadhaa?r|income|village|transaction/i)
  })
})

describe('progress persistence (localStorage-style store)', () => {
  it('saves, lists and reloads profiles in a new repository instance', () => {
    const store = new MemoryStore()
    const p = playLesson(fresh(), RVP, DEVELOPING, at(1)).profile
    new LocalProgressRepository(store).save(p)
    const again = new LocalProgressRepository(store)
    expect(again.list().map((x) => x.learnerId)).toEqual(['DL-77'])
    expect(again.get('DL-77')).toEqual(p)
    expect(deriveProgress(again.get('DL-77')!)).toEqual(deriveProgress(p))
  })
  it('ignores corrupted or foreign records and refuses to save invalid profiles', () => {
    const store = new MemoryStore()
    const repo = new LocalProgressRepository(store)
    repo.save(fresh())
    store.setItem(`${PROGRESS_PREFIX}learner.DL-77`, '{not json')
    expect(repo.get('DL-77')).toBeNull()
    expect(repo.list()).toEqual([])
    expect(() => repo.save({ ...fresh(), learnerId: 'phone-9876543210' })).toThrow()
  })
  it('notifies subscribers on save', () => {
    const repo = new LocalProgressRepository(new MemoryStore())
    let n = 0
    const off = repo.subscribe(() => n++)
    repo.save(fresh())
    off()
    repo.save(fresh())
    expect(n).toBe(1)
  })
})

describe('understanding levels: introduced → practising → shown understanding', () => {
  it('assessment answers alone = introduced; lesson answers = practising', () => {
    let s = startAssessment({ learnerId: 'DL-77', business: 'vegetable', attempt: 1, now: T0 })
    for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'unsure')!.id, source: 'tap', lang: 'en', answeredAt: T0 }).session
    let p = recordAssessment(fresh(), finalize(s, { now: T0 }), T0)
    expect(view(p).concepts.revenue_vs_profit.level).toBe('introduced')
    expect(view(p).concepts.customer_credit.level).toBe('introduced')
    p = playLesson(p, RVP, [N, N, N, A('sales')], at(5)).profile
    expect(view(p).concepts.revenue_vs_profit.level).toBe('practicing')
  })
  it('one correct answer is never "shown understanding"; two independent first-try answers are', () => {
    let p = recordPracticeAnswer(fresh(), { concept: 'revenue_vs_profit', itemKey: 'x', outcome: 'correct', firstTry: true }, at(1))
    expect(view(p).concepts.revenue_vs_profit.level).toBe('practicing')
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'x', outcome: 'correct', firstTry: true }, at(2))
    expect(view(p).concepts.revenue_vs_profit.level).toBe('practicing') // same question twice is not independent
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'y', outcome: 'correct', firstTry: true }, at(3))
    expect(view(p).concepts.revenue_vs_profit.level).toBe('demonstrated')
    // A later misconception brings it back to practising and flags it
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'z', outcome: 'misconception', misconception: 'misconception_revenue_vs_profit', firstTry: true }, at(4))
    const c = view(p).concepts.revenue_vs_profit
    expect(c.level).toBe('practicing')
    expect(c.needsPractice).toBe(true)
    expect(c.needsPracticeReasons).toContain('openMisconception')
  })
  it('a right answer only on the second try does not count as independent evidence', () => {
    const p = playLesson(fresh(), RVP, DEVELOPING, at(1)).profile
    expect(view(p).concepts.revenue_vs_profit.level).toBe('practicing')
    expect(view(p).concepts.revenue_vs_profit.needsPracticeReasons).toEqual(expect.arrayContaining(['lessonDeveloping', 'repeatedMisses'])) // 2026-10-30: a "developing" lesson result now has its own reason (was reported to coaches as "needs more practice")
  })
})

describe('lesson completion updates and repeated attempts', () => {
  it('records starts, answers (with first-try flags), completion and result', () => {
    const p = playLesson(fresh(), RVP, DEVELOPING, at(1)).profile
    const v = view(p)
    expect(v.lessons.revenue_vs_profit).toMatchObject({ status: 'completed', starts: 1, completions: 1, lastResult: 'developing' })
    const lessonAnswers = p.events.filter((e) => e.type === 'answer' && e.source === 'lesson')
    expect(lessonAnswers.map((e) => e.type === 'answer' && [e.itemKey.split(':')[2], e.outcome, e.firstTry])).toEqual([
      ['response', 'misconception', true],
      ['response', 'correct', false],
      ['practice', 'misconception', true],
      ['practice', 'correct', false],
      ['check', 'correct', true],
    ])
    expect(v.misconceptions.map((m) => [m.code, m.resolved])).toEqual([
      ['misconception_revenue_vs_profit', true],
      ['misconception_ignores_hidden_costs', true],
    ])
  })
  it('doing the lesson again counts a second start, shows in-progress with a resume step, then a second completion', () => {
    const store = new MemoryStore()
    let p = playLesson(fresh(), RVP, DEVELOPING, at(1)).profile
    const second = playLesson(p, RVP, [N, N], at(30))
    p = second.profile
    saveLesson(store, p.learnerId, second.state)
    const resume = (l: string) => loadLesson(store, p.learnerId, l)?.step ?? null
    expect(deriveProgress(p, { resumeStep: resume }).lessons.revenue_vs_profit).toMatchObject({ status: 'inProgress', starts: 2, completions: 1, resumeStep: 'example' })
    p = playLesson(p, RVP, ALL_RIGHT, at(60)).profile
    expect(view(p).lessons.revenue_vs_profit).toMatchObject({ status: 'completed', starts: 3, completions: 2, lastResult: 'understood' })
    expect(view(p).concepts.revenue_vs_profit.level).toBe('demonstrated')
  })
  it('recommendation moves to the next topic after lesson 1, and back to it if a misconception reopens', () => {
    let p = fresh()
    expect(view(p).recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', source: 'rules' })
    p = playLesson(p, RVP, DEVELOPING, at(1)).profile
    expect(view(p).recommendation.lessonId).toBe('business_expenses')
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'q', outcome: 'misconception', misconception: 'misconception_revenue_vs_profit', firstTry: true }, at(90))
    expect(view(p).recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', reason: 'misconception' })
  })
})

describe('weekly challenges', () => {
  it('one approved activity per lesson; a new one replaces an unchecked old one; unapproved ids are refused', () => {
    let p = assignChallenge(fresh(), 'rvp.main', at(1))
    expect(view(p).activeChallenge).toMatchObject({ challengeId: 'rvp.main', status: 'assigned', lessonId: 'revenue_vs_profit' })
    p = assignChallenge(p, 'sep.twoPlaces', at(2))
    expect(view(p).challenges.map((c) => c.status)).toEqual(['replaced', 'assigned'])
    expect(() => assignChallenge(p, 'loan.takeOne', at(3))).toThrow(/approved/)
  })
  it('check-in is due only at the NEXT session (coach start or return after 4 hours)', () => {
    let p = startSession(fresh(), 'learner', at(0))
    p = assignChallenge(p, 'rvp.main', at(10))
    expect(view(p).checkInDue).toBe(false)
    expect(ensureSession(p, at(60))).toBe(p) // same visit
    p = ensureSession(p, at(60 * 24))
    expect(view(p).checkInDue).toBe(true)
    p = assignChallenge(startSession(fresh(), 'coach', at(0)), 'rvp.main', at(1))
    expect(view(startSession(p, 'coach', at(2))).checkInDue).toBe(true)
  })
  it('incomplete activities get a smaller or easier follow-up, never a reprimand', () => {
    expect(planFollowUp('rvp.main', 'done', [])).toEqual({ challengeId: 'exp.oneExpense', messageKey: 'ci.msg.done', suggestReplay: false })
    expect(planFollowUp('rvp.main', 'partly', [])).toEqual({ challengeId: 'rvp.oneEvening', messageKey: 'ci.msg.partly', suggestReplay: false })
    expect(planFollowUp('rvp.main', 'notYet', ['noTime'])).toEqual({ challengeId: 'rvp.oneEvening', messageKey: 'ci.msg.notYetBusy', suggestReplay: false })
    expect(planFollowUp('rvp.main', 'notYet', ['notClear'])).toEqual({ challengeId: 'rvp.explain', messageKey: 'ci.msg.notYetUnclear', suggestReplay: true })
    expect(planFollowUp('rvp.main', 'partly', ['hardToCount']).challengeId).toBe('rvp.explain')
    expect(planFollowUp('sep.twoPlaces', 'notYet', ['shopClosed']).challengeId).toBe('sep.oneDay')
    for (const lang of ['en', 'hi', 'te'] as const)
      for (const k of ['ci.msg.done', 'ci.msg.partly', 'ci.msg.notYetBusy', 'ci.msg.notYetUnclear'] as const) {
        const msg = DICTS[lang][k]
        expect(msg.length).toBeGreaterThan(10)
        expect(msg).not.toMatch(/fail|lazy|should have|wrong|disappoint|bad|असफल|गलत|आलसी|విఫల|తప్పు|సోమరి/i)
      }
  })
  it('check-in records status, difficulties and a screened note; the follow-up is only assigned when accepted', () => {
    let p = startSession(assignChallenge(startSession(fresh(), 'coach', at(0)), 'rvp.main', at(1)), 'coach', at(60 * 24 * 7))
    const rec = view(p).activeChallenge!.recordId
    expect(() => checkInChallenge(p, rec, 'notYet', ['noTime'], 'call me on 98765 43210', at(60 * 24 * 7 + 1), containsPersonalData)).toThrow(NoteRejected)
    expect(() => checkInChallenge(p, rec, 'notYet', ['noTime'], 'x'.repeat(141), at(60 * 24 * 7 + 1), containsPersonalData)).toThrow(NoteRejected)
    const r = checkInChallenge(p, rec, 'notYet', ['noTime', 'noTime', 'shopClosed'], 'wedding in the family', at(60 * 24 * 7 + 1), containsPersonalData)
    p = r.profile
    const v = view(p)
    expect(v.challenges[0]).toMatchObject({ status: 'notYet', checkIn: { difficulties: ['noTime', 'shopClosed'], note: 'wedding in the family', offeredFollowUpId: 'rvp.oneEvening' } })
    expect(v.activeChallenge).toBeNull()
    expect(v.checkInDue).toBe(false)
    expect(() => checkInChallenge(p, rec, 'done', [], undefined, at(60 * 24 * 8))).toThrow(/already/)
    p = assignChallenge(p, r.plan.challengeId!, at(60 * 24 * 7 + 2), rec)
    expect(view(p).activeChallenge).toMatchObject({ challengeId: 'rvp.oneEvening', followUpOf: rec, status: 'assigned' })
  })
  it('every approved activity has wording in English, Hindi and Telugu for every business', () => {
    for (const c of CHALLENGES)
      for (const lang of ['en', 'hi', 'te'] as const)
        for (const b of ['vegetable', 'tea', 'grocery'] as const) {
          const w = challengeWording(c.id, lang, b)
          expect(w.length, `${c.id}/${lang}/${b}`).toBeGreaterThan(20)
          if (lang === 'hi') expect(w).toMatch(/[ऀ-ॿ]/)
          if (lang === 'te') expect(w).toMatch(/[ఀ-౿]/)
        }
  })
})

describe('language switching never resets progress', () => {
  it('only the language and a language_changed event change; every derived number stays the same', () => {
    const before = playLesson(assignChallenge(fresh(), 'rvp.main', at(0)), RVP, DEVELOPING, at(1)).profile
    const after = setLanguage(setLanguage(before, 'te', at(100)), 'hi', at(101))
    expect(after.language).toBe('hi')
    expect(after.events.slice(0, before.events.length)).toEqual(before.events)
    expect(after.events.slice(before.events.length).map((e) => e.type)).toEqual(['language_changed', 'language_changed'])
    const { lastActivityAt: _a, ...vb } = deriveProgress(before)
    const { lastActivityAt: _b, ...va } = deriveProgress(after)
    void _a
    void _b
    expect(va).toEqual(vb)
    expect(setLanguage(after, 'hi', at(102))).toBe(after) // no-op
  })
})

describe('coach adjustments', () => {
  it('a coach can change the next lesson with a recorded reason; completing it or reverting returns to the rules', () => {
    let p = fresh()
    p = coachOverride(p, { fromLessonId: 'revenue_vs_profit', toLessonId: 'business_household_separation', reason: 'learnerRequest', note: 'Asked about two tins' }, at(1), containsPersonalData)
    expect(view(p).recommendation).toMatchObject({ lessonId: 'business_household_separation', source: 'coach', reason: 'learnerRequest', rulesLessonId: 'revenue_vs_profit' })
    expect(view(p).coachLog).toHaveLength(1)
    const reverted = coachOverride(p, { fromLessonId: 'business_household_separation', toLessonId: null, reason: 'other' }, at(2))
    expect(view(reverted).recommendation.source).toBe('rules')
    expect(() => coachOverride(p, { fromLessonId: 'revenue_vs_profit', toLessonId: 'revenue_vs_profit', reason: 'other', note: 'Her number is 9876543210' }, at(3), containsPersonalData)).toThrow(NoteRejected)
  })
})

describe('demo data and reset', () => {
  it('builds 6 fictional learners from the real engines', () => {
    const store = new MemoryStore()
    const learners = buildDemoLearners(store, '2026-10-28T12:00:00.000Z')
    expect(learners.map((l) => l.learnerId)).toEqual(['DL-01', 'DL-02', 'DL-03', 'DL-04', 'DL-05', 'DL-06'])
    expect(learners.every((l) => l.isDemo)).toBe(true)
    const v = Object.fromEntries(learners.map((l) => [l.learnerId, deriveProgress(l, { resumeStep: (id) => loadLesson(store, l.learnerId, id)?.step ?? null })]))
    expect(v['DL-01'].lessons.revenue_vs_profit.status).toBe('notStarted')
    expect(v['DL-02'].lessons.revenue_vs_profit).toMatchObject({ status: 'inProgress', resumeStep: 'practice' })
    expect(v['DL-03'].activeChallenge?.challengeId).toBe('rvp.main')
    expect(v['DL-04'].recommendation).toMatchObject({ source: 'coach', lessonId: 'business_expenses', rulesLessonId: 'customer_credit' })
    expect(v['DL-05'].challenges.map((c) => c.status)).toEqual(['notYet', 'assigned'])
    for (const l of learners) for (const a of Object.values(l.alias)) expect(containsPersonalData(a)).toBe(false)
  })
  it('reset clears every key this app wrote (and only those), then re-seeds', () => {
    const store = new MemoryStore()
    resetDemo(store, '2026-10-28T12:00:00.000Z')
    const repo = new LocalProgressRepository(store)
    repo.save(playLesson(repo.get('DL-01')!, RVP, ALL_RIGHT, at(1)).profile)
    store.setItem('hisaab.ui.v1', '{"activeLearnerId":"DL-03"}')
    store.setItem('hisaab-saathi-wireframe-v1', '{}')
    store.setItem('someone-elses-key', 'keep')
    resetDemo(store, '2026-10-28T13:00:00.000Z')
    expect(deriveProgress(repo.get('DL-01')!).lessons.revenue_vs_profit.completions).toBe(0)
    expect(store.getItem('hisaab.ui.v1')).toBeNull()
    expect(store.getItem('hisaab-saathi-wireframe-v1')).toBeNull()
    expect(store.getItem('someone-elses-key')).toBe('keep')
    expect(repo.list()).toHaveLength(6)
  })
})

describe('tiered diagnostic → learner progress (2026-11-01)', () => {
  const run = (choose: (id: string) => string) => {
    let s = startAssessment({ learnerId: 'DL-01', business: 'vegetable', attempt: 1, now: T0 })
    for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: choose(id), source: 'tap', lang: 'en', answeredAt: T0 }).session
    return finalize(s, { now: T0 })
  }
  const correct = (id: string) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'correct')!.id
  it('Today / Coach recommend the same lesson as the diagnostic (foundational misconception outranks an applied gap)', () => {
    const r = run((id) => (id === 'crd_a_credit_is_cash' ? 'yes' : id === 'exp_b_total_stock_cost' ? 'stock_only' : correct(id)))
    expect(r.recommendation.lessonId).toBe('customer_credit')
    const p = recordAssessment(fresh(), r, T0)
    expect(view(p).recommendation.lessonId).toBe('customer_credit')
    expect(view(p).assessment.latest?.tier).toBe('intermediate')
    expect(view(p).assessment.latest?.mainMisconceptions).toEqual(['misconception_credit_as_cash', 'misconception_ignores_hidden_costs'])
  })
})

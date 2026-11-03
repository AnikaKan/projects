// Coaching assistant logic: statuses, levels, evidence-backed recommendations ("Why this lesson?"),
// weekly-activity follow-up, coach overrides, notes and guided sessions. Pure functions, fictional data.
import { describe, expect, it } from 'vitest'
import { MemoryStore } from '../../assessment/storage'
import { ITEMS_BY_ID, LESSON_CATALOG } from '../../assessment/bank'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../../assessment/engine'
import type { Concept } from '../../assessment/types'
import { assess, buildDemoLearners } from '../../progress/demo'
import { assignChallenge, checkInChallenge, coachOverride, createProfile, deriveProgress, markOnboarded, recordAssessment, recordPracticeAnswer } from '../../progress/engine'
import { CHALLENGES_BY_ID } from '../../progress/challenges'
import type { LearnerProfile } from '../../progress/types'
import type { Business } from '../../lib/calc'
import type { Lang } from '../../i18n/strings'
import { containsPersonalData, makesUnsupportedClaim, mentionsAdviceTopic, extractNumbers } from '../../../shared/aiGuards.mjs'
import { validateRewrite } from '../../../shared/coachWording.mjs'
import {
  addCoachNote,
  acceptRecommendation,
  buildRecommendation,
  coachSummary,
  completeSession,
  EmptyNote,
  evidenceIsGrounded,
  homeCounts,
  learningLevel,
  openSessionOf,
  pauseSession,
  recordSessionPractice,
  sessionsOf,
  setCoachLevel,
  setSessionStep,
  startCoachSession,
  verifyChallenge,
} from '../model'
import { explain } from '../explain'
import { BUSINESS_WORDS, PLAYBOOK, exampleAmounts, fill } from '../playbook'
import { practiceFor } from '../sessionContent'
import { requestSimplerWording } from '../aiWording'

const NOW = '2026-11-01T10:00:00.000Z'
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()
const days = (d: number) => new Date(Date.parse(NOW) + d * 86400_000).toISOString()
const LANGS: Lang[] = ['en', 'hi', 'te']
const BUSINESSES: Business[] = ['vegetable', 'tea', 'grocery']

function learner(id: string, business: Business = 'vegetable', picks?: Partial<Record<Concept, 'correct' | 'misconception' | 'unsure'>>, store = new MemoryStore()) {
  let p = markOnboarded(createProfile({ learnerId: id, alias: { en: 'Asha', hi: 'आशा', te: 'ఆశ' }, language: 'te', business, now: NOW }))
  if (picks) p = recordAssessment(p, assess(store, id, business, picks, at(1)), at(1))
  return p
}
const rec = (p: LearnerProfile) => buildRecommendation(p, deriveProgress(p))
const sum = (p: LearnerProfile, now = NOW) => coachSummary(p, deriveProgress(p), now)
const ex = (p: LearnerProfile, lang: Lang = 'en') => explain(rec(p), { lang, name: p.alias[lang], business: p.business })

describe('1 · different learners have different progress', () => {
  const store = new MemoryStore()
  const demo = buildDemoLearners(store, NOW)
  const rows = demo.map((p) => sum(p))
  it('statuses, levels, topics and explanations differ by saved history', () => {
    const by = Object.fromEntries(rows.map((r) => [r.learnerId, r]))
    expect(by['DL-01']).toMatchObject({ status: 'followUp', reasons: ['noCheckYet'] })
    expect(by['DL-01'].level.source).toBe('none')
    expect(by['DL-02'].status).toBe('needsPractice')
    expect(by['DL-03'].reasons).toContain('challengeNotChecked')
    expect(by['DL-06']).toMatchObject({ status: 'doingWell', readyForNextLesson: true })
    expect(by['DL-04'].level.value).toBe('intermediate')
    expect(by['DL-02'].level.value).toBe('foundational')
    const topics = new Set(rows.map((r) => r.recommendation.recommendedLessonId))
    expect(topics.size).toBeGreaterThanOrEqual(3)
    const heads = demo.map((p) => explain(rec(p), { lang: 'en', name: p.alias.en, business: p.business }).headline)
    expect(new Set(heads).size).toBe(heads.length) // every demo learner gets her own explanation
  })
  it('home counts come from those statuses', () => {
    expect(homeCounts(rows)).toEqual({ active: 6, needAttention: 5, challengesToFollowUp: 3, readyForNext: 2 })
  })
  it('changing one learner never changes another learner’s summary', () => {
    const before = JSON.stringify(sum(demo[2]))
    const changed = recordPracticeAnswer(demo[1], { concept: 'revenue_vs_profit', itemKey: 'x', outcome: 'incorrect', firstTry: true }, at(5))
    expect(sum(changed).learnerId).toBe('DL-02')
    expect(JSON.stringify(sum(demo[2]))).toBe(before)
  })
})

describe('2 · incorrect diagnostic answers produce relevant coaching recommendations', () => {
  it('sales = profit → Sales and profit, R1, the matching misconception, and a matching coaching action', () => {
    const p = learner('TL-01', 'vegetable', { revenue_vs_profit: 'misconception' })
    const r = rec(p)
    expect(r).toMatchObject({ recommendedLessonId: 'revenue_vs_profit', recommendationRuleId: 'R1_MISCONCEPTION', recommendedLevel: 'foundational', misconceptionIds: ['misconception_revenue_vs_profit'] })
    const x = ex(p)
    expect(x.action).toBe('Help Asha see that selling ₹500 of vegetables does not mean she earned ₹500 in profit.')
    expect(x.activity).toContain('₹500 in sales and ₹300 for the vegetables')
    expect(x.question).toBe('What other costs might reduce the money she keeps?')
  })
  it('mixing home and shop money only → Two pockets', () => {
    const r = rec(learner('TL-02', 'tea', { business_household_separation: 'misconception' }))
    expect(r).toMatchObject({ recommendedLessonId: 'business_household_separation', recommendationRuleId: 'R1_MISCONCEPTION' })
  })
  it('"not sure" → R2; basics right but applied question wrong → R3 at intermediate level', () => {
    expect(rec(learner('TL-03', 'vegetable', { business_expenses: 'unsure', customer_credit: 'unsure' })).recommendationRuleId).toBe('R2_UNSURE')
    // Applied gap: every foundational question right, the harder sales/profit question wrong.
    const store = new MemoryStore()
    let s = startAssessment({ learnerId: 'TL-04', business: 'vegetable', attempt: 1, now: at(1) })
    for (let id = currentItemId(s); id; id = currentItemId(s)) {
      const item = ITEMS_BY_ID[id]
      const opt = item.form === 'B' && item.concept === 'revenue_vs_profit' ? item.options.find((o) => o.outcome.kind === 'misconception')! : item.options.find((o) => o.outcome.kind === 'correct')!
      s = submitAnswer(s, { itemId: id, optionId: opt.id, source: 'tap', lang: 'en', answeredAt: at(1) }).session
    }
    void store
    const p = recordAssessment(learner('TL-04'), finalize(s, { now: at(1) }), at(1))
    const r = rec(p)
    expect(r).toMatchObject({ recommendationRuleId: 'R3_APPLIED_GAP', recommendedLevel: 'intermediate', recommendedLessonId: 'revenue_vs_profit' })
    expect(ex(p).evidence[0]).toMatch(/^Harder first-check question: to “You sold ₹1,000/)
  })
  it('all correct → next topic in the path, with no invented difficulty', () => {
    const p = learner('TL-05', 'grocery', {})
    const r = rec(p)
    expect(r.recommendationRuleId).toBe('R5_NEXT_IN_PATH')
    expect(r.supportingEvidence.some((e) => e.kind === 'diagnostic' || e.kind === 'lessonMiss' || e.kind === 'practiceMiss')).toBe(false)
    expect(r.evidenceStrength).toBe('none')
  })
})

describe('"Why this lesson?" — explanations come only from saved evidence', () => {
  const demo = buildDemoLearners(new MemoryStore(), NOW)
  it('Saraswathi (vegetable stall, sales = profit, struggled again in the lesson): the example from the brief', () => {
    const p = demo.find((x) => x.learnerId === 'DL-02')!
    const r = rec(p)
    expect(r).toMatchObject({ learnerId: 'DL-02', recommendedLessonId: 'revenue_vs_profit', recommendedLevel: 'foundational', misconceptionIds: ['misconception_revenue_vs_profit'], evidenceStrength: 'clear' })
    const x = explain(r, { lang: 'en', name: 'Saraswathi', business: p.business })
    expect(x.evidence[0]).toBe('First check: to “You sold ₹500 worth of vegetables and spent ₹300 on the vegetables sold. Is your profit ₹500?” she answered “Yes”.')
    expect(x.evidence[1]).toBe('Lesson “Sales and profit”, “Your turn” question: Counts all sales money as profit. She got it right on a later try.')
    expect(x.learn).toBe('Sales are not the same as profit. The cost of the goods must come out first.')
    expect(x.action).toBe('Help Saraswathi see that selling ₹500 of vegetables does not mean she earned ₹500 in profit.')
    expect(x.insufficient).toBeNull()
  })
  it('the structured object has every required field', () => {
    const r = rec(demo[1])
    for (const k of ['learnerId', 'recommendedLessonId', 'recommendedLevel', 'misconceptionIds', 'supportingEvidence', 'reason', 'suggestedCoachingAction', 'recommendationRuleId']) expect(r).toHaveProperty(k)
  })
  it('every evidence point points back to a real stored event (all demo learners, all languages)', () => {
    for (const p of demo) {
      const r = rec(p)
      expect(evidenceIsGrounded(p, r)).toBe(true)
      expect(r.keyEvidence.length).toBeLessThanOrEqual(3)
      for (const lang of LANGS) {
        const x = explain(r, { lang, name: p.alias[lang], business: p.business })
        expect(x.evidence).toHaveLength(r.keyEvidence.length)
        expect(x.allEvidence).toHaveLength(r.supportingEvidence.length)
        for (const t of [x.headline, x.priority, x.learn, x.action, ...x.allEvidence]) expect(t).not.toMatch(/cv\.|mis\.|\{\w+\}/)
      }
    }
  })
  it('never claims she struggled in practice when her practice answers were right', () => {
    let p = learner('TL-06', 'vegetable', { revenue_vs_profit: 'misconception' })
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:1', outcome: 'correct', firstTry: true }, at(5))
    const r = rec(p)
    expect(r.supportingEvidence.some((e) => e.kind === 'lessonMiss' || e.kind === 'practiceMiss')).toBe(false)
    expect(ex(p).evidence).toContain('In lessons and practice: 1 of 1 answers right.')
  })
  it('a single diagnostic answer is flagged as limited evidence with the agreed wording', () => {
    const p = learner('TL-07', 'tea', { business_household_separation: 'misconception' })
    expect(rec(p).evidenceStrength).toBe('limited')
    expect(ex(p).insufficient).toBe('Recommended based on the initial assessment. More practice is needed to understand this learning need.')
    expect(ex(p).evidence).toContain('Not practised in lessons yet.')
  })
  it('a learner with no assessment history gets an honest "no history" explanation', () => {
    const p = learner('TL-08')
    const r = rec(p)
    expect(r.recommendationRuleId).toBe('R0_NO_HISTORY')
    expect(r.supportingEvidence).toEqual([{ kind: 'notPractised' }])
    const x = ex(p)
    expect(x.headline).toBe('No first check yet, so there is no learning history to explain.')
    expect(x.action).toContain('5-question first check')
    expect(x.allEvidence.join(' ')).not.toMatch(/First check:|answered/)
  })
  it('is deterministic: same history → identical recommendation; language does not change the structure', () => {
    for (const p of demo) {
      const copy = JSON.parse(JSON.stringify(p)) as LearnerProfile
      expect(JSON.stringify(rec(copy))).toBe(JSON.stringify(rec(p)))
    }
  })
  it('Hindi and Telugu explanations carry the same evidence, in their own script', () => {
    const p = demo.find((x) => x.learnerId === 'DL-02')!
    const r = rec(p)
    const hi = explain(r, { lang: 'hi', name: p.alias.hi, business: p.business })
    const te = explain(r, { lang: 'te', name: p.alias.te, business: p.business })
    expect(hi.evidence[0]).toMatch(/[ऀ-ॿ]/)
    expect(te.evidence[0]).toMatch(/[ఀ-౿]/)
    for (const t of [hi.evidence[0], te.evidence[0]]) expect(extractNumbers(t).map((n) => n.value)).toEqual([500, 300, 500])
    expect(hi.action).toContain('सरस्वती')
    expect(te.action).toContain('సరస్వతి')
  })
})

describe('3 · weekly activities update correctly (done ≠ understood)', () => {
  const base = () => assignChallenge(learner('TL-10', 'vegetable', { revenue_vs_profit: 'misconception' }), 'rvp.main', at(2))
  it('agreed → not due yet → due after 2 days → coach checks in → verify → explained', () => {
    let p = base()
    expect(sum(p, at(10)).challenge.followUpRule).not.toBe('F1_ASK')
    expect(sum(p, days(3)).challenge).toMatchObject({ followUpRule: 'F1_ASK', displayStatus: 'notChecked' })
    expect(sum(p, days(3)).reasons).toContain('challengeNotChecked')
    p = checkInChallenge(p, 'TL-10-ch1', 'done', [], undefined, days(3), undefined, 'coach').profile
    expect(p.events.at(-1)).toMatchObject({ type: 'challenge_checkin', by: 'coach', status: 'done' })
    expect(sum(p, days(3)).challenge).toMatchObject({ followUpRule: 'F2_VERIFY', displayStatus: 'completed' })
    expect(sum(p, days(3)).status).toBe('followUp') // "done" alone does not count as understood
    p = verifyChallenge(p, 'TL-10-ch1', 'explained', deriveProgress(p), days(3))
    expect(sum(p, days(3)).challenge.followUpRule).toBe('F3_EXPLAINED')
    expect(p.events.at(-1)).toMatchObject({ type: 'answer', source: 'practice', itemKey: 'coach:verify:TL-10-ch1', outcome: 'correct' })
    expect(sum(p, days(3)).challenge.next).toMatchObject({ challengeId: 'exp.oneExpense', agreed: false })
  })
  it('partly → smaller; not yet (unclear) → easier + replay; not yet (no time) → smaller; agreeing the follow-up clears the barrier', () => {
    const ci = (s: 'partly' | 'notYet', d: ('noTime' | 'notClear')[]) => checkInChallenge(base(), 'TL-10-ch1', s, d, undefined, days(3), undefined, 'coach')
    expect(sum(ci('partly', []).profile, days(3)).challenge).toMatchObject({ followUpRule: 'F4_PARTLY', displayStatus: 'partly', next: { challengeId: 'rvp.oneEvening' } })
    expect(sum(ci('notYet', ['notClear']).profile, days(3)).challenge).toMatchObject({ followUpRule: 'F5_UNCLEAR', displayStatus: 'notCompleted', next: { challengeId: 'rvp.explain' } })
    const r = ci('notYet', ['noTime'])
    expect(sum(r.profile, days(3)).challenge.followUpRule).toBe('F6_PRACTICAL')
    expect(sum(r.profile, days(3)).reasons).toContain('challengeBarrier')
    const agreed = assignChallenge(r.profile, r.plan.challengeId!, days(3), 'TL-10-ch1')
    expect(sum(agreed, days(3)).reasons).not.toContain('challengeBarrier')
    expect(sum(agreed, days(3)).challenge.next).toMatchObject({ challengeId: 'rvp.oneEvening', agreed: true })
  })
  it('"could not explain" keeps the learner in needs practice and is shown as evidence', () => {
    let p = checkInChallenge(base(), 'TL-10-ch1', 'done', [], undefined, days(3)).profile
    p = verifyChallenge(p, 'TL-10-ch1', 'notYet', deriveProgress(p), days(3))
    const s = sum(p, days(3))
    expect(s.reasons).toContain('couldNotExplain')
    expect(explain(s.recommendation, { lang: 'en', name: 'Asha', business: 'vegetable' }).allEvidence).toContain('Coach check: she could not explain her activity yet.')
  })
})

describe('4 + 10 · guided session: progress, pause and resume', () => {
  it('a session records practice and a new activity into her progress, can be paused and resumed, then completed', () => {
    let p = learner('TL-20', 'vegetable', { revenue_vs_profit: 'misconception' })
    const v0 = deriveProgress(p)
    const r0 = startCoachSession(p, rec(p), at(10))
    p = r0.profile
    expect(r0.sessionId).toBe('TL-20-cs1')
    expect(deriveProgress(p).sessions.count).toBe(v0.sessions.count + 1)
    expect(openSessionOf(p)).toMatchObject({ status: 'open', step: 'checkin', lessonId: 'revenue_vs_profit', level: 'foundational', ruleId: 'R1_MISCONCEPTION' })
    p = setSessionStep(p, r0.sessionId, 'practice', at(12))
    p = recordSessionPractice(p, r0.sessionId, { concept: 'revenue_vs_profit', question: 'calc:revenue_vs_profit:foundational', outcome: 'misconception', misconception: 'misconception_revenue_vs_profit' }, at(13))
    p = recordSessionPractice(p, r0.sessionId, { concept: 'revenue_vs_profit', question: 'calc:revenue_vs_profit:foundational', outcome: 'correct' }, at(14))
    p = pauseSession(p, r0.sessionId, at(15))
    expect(openSessionOf(p)).toMatchObject({ status: 'paused', step: 'practice' })
    expect(sum(p).reasons).toContain('sessionPaused')
    // Resume: starting again returns the same session and adds no new learner session.
    const again = startCoachSession(p, rec(p), at(60))
    expect(again.sessionId).toBe(r0.sessionId)
    expect(again.profile).toBe(p)
    p = setSessionStep(p, r0.sessionId, 'action', at(61))
    expect(openSessionOf(p)!.status).toBe('open')
    p = assignChallenge(p, 'rvp.main', at(62))
    p = addCoachNote(p, { categories: ['needsPractice'], sessionId: r0.sessionId }, at(63))
    p = completeSession(p, r0.sessionId, at(64))
    const s = sessionsOf(p)[0]
    expect(s).toMatchObject({ status: 'completed', visited: ['checkin', 'practice', 'action'], recorded: { practiced: 2, practiceCorrect: 1, assigned: 'rvp.main', notes: 1 } })
    expect(openSessionOf(p)).toBeNull()
    const v = deriveProgress(p)
    expect(v.practice.bySource.practice).toBe(v0.practice.bySource.practice + 2)
    expect(v.activeChallenge?.challengeId).toBe('rvp.main')
    // Only the first try counts as independent evidence.
    expect(p.events.filter((e) => e.type === 'answer' && e.itemKey.startsWith('coach:TL-20-cs1')).map((e) => (e as { firstTry: boolean }).firstTry)).toEqual([true, false])
    expect(() => recordSessionPractice(p, r0.sessionId, { concept: 'revenue_vs_profit', question: 'q', outcome: 'correct' }, at(70))).toThrow(/already complete/)
  })
  it('session practice content is approved, business-specific and level-specific', () => {
    for (const b of BUSINESSES)
      for (const lang of LANGS) {
        const f = practiceFor('revenue_vs_profit', 'foundational', b, lang)
        const i = practiceFor('revenue_vs_profit', 'intermediate', b, lang)
        expect(f.options.filter((o) => o.outcome === 'correct')).toHaveLength(1)
        expect(f.question).not.toBe(i.question)
        for (const c of ['business_expenses', 'business_household_separation', 'customer_credit', 'savings_cash_management'] as Concept[])
          for (const lvl of ['foundational', 'intermediate'] as const) expect(practiceFor(c, lvl, b, lang).options.filter((o) => o.outcome === 'correct')).toHaveLength(1)
      }
  })
})

describe('5 + 7 · coordinator overrides are saved and never delete evidence; levels never auto-promote', () => {
  it('lesson override keeps the original rule and evidence', () => {
    const p0 = learner('TL-30', 'tea', { revenue_vs_profit: 'misconception' })
    const before = rec(p0)
    const p = coachOverride(p0, { fromLessonId: 'revenue_vs_profit', toLessonId: 'business_household_separation', reason: 'learnerRequest', ruleId: before.recommendationRuleId }, at(5))
    const after = rec(p)
    expect(after).toMatchObject({ recommendedLessonId: 'business_household_separation', recommendationRuleId: 'C1_COACH_CHOICE', rules: { lessonId: 'revenue_vs_profit', ruleId: 'R1_MISCONCEPTION', misconceptionIds: ['misconception_revenue_vs_profit'] } })
    expect(p.events.slice(0, p0.events.length)).toEqual(p0.events) // append-only
    expect(explain(after, { lang: 'en', name: 'Asha', business: 'tea' }).headline).toContain('The app suggested Sales and profit: Her answers show a common mistake: Counts all sales money as profit.')
  })
  it('level override needs a reason, is saved, and can be reverted to the diagnostic level', () => {
    let p = learner('TL-31', 'vegetable', { revenue_vs_profit: 'misconception' })
    expect(learningLevel(p, deriveProgress(p))).toMatchObject({ value: 'foundational', source: 'diagnostic' })
    p = setCoachLevel(p, { level: 'intermediate', reason: 'showedUnderstanding', note: 'Explained it well' }, 'foundational', at(5))
    expect(p.events.at(-1)).toMatchObject({ type: 'coach_level_set', level: 'intermediate', fromLevel: 'foundational', reason: 'showedUnderstanding' })
    expect(rec(p).recommendedLevel).toBe('intermediate')
    expect(rec(p).suggestedCoachingAction.level).toBe('intermediate')
    p = setCoachLevel(p, { level: null, reason: 'other' }, 'intermediate', at(6))
    expect(learningLevel(p, deriveProgress(p))).toMatchObject({ value: 'foundational', source: 'diagnostic' })
    expect(() => setCoachLevel(p, { level: 'intermediate', reason: 'other', note: 'Call 9876543210' }, 'foundational', at(7), containsPersonalData)).toThrow()
  })
  it('one correct answer never promotes; two independent first-try answers only SUGGEST moving up', () => {
    let p = learner('TL-32', 'vegetable', { revenue_vs_profit: 'misconception' })
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:1', outcome: 'correct', firstTry: true }, at(5))
    expect(learningLevel(p, deriveProgress(p))).toMatchObject({ value: 'foundational', suggestion: null, independentCorrect: 1 })
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:1', outcome: 'correct', firstTry: false }, at(6)) // same question again: not independent
    expect(learningLevel(p, deriveProgress(p)).suggestion).toBeNull()
    p = recordPracticeAnswer(p, { concept: 'revenue_vs_profit', itemKey: 'practice:m1:2', outcome: 'correct', firstTry: true }, at(7))
    expect(learningLevel(p, deriveProgress(p))).toMatchObject({ value: 'foundational', suggestion: 'moveUp', independentCorrect: 2 })
  })
  it('accepting stores a snapshot of what was accepted', () => {
    const p0 = learner('TL-33', 'vegetable', { revenue_vs_profit: 'misconception' })
    const p = acceptRecommendation(p0, rec(p0), at(5))
    expect(p.events.at(-1)).toMatchObject({ type: 'coach_accepted', lessonId: 'revenue_vs_profit', level: 'foundational', ruleId: 'R1_MISCONCEPTION' })
    expect(rec(p).acceptedAt).toBe(at(5))
  })
})

describe('coach notes', () => {
  it('structured categories, optional short text, personal data refused, empty refused', () => {
    const p0 = learner('TL-40')
    const p = addCoachNote(p0, { categories: ['languageDifficulty', 'languageDifficulty'], text: '  Prefers Telugu audio ' }, at(1), containsPersonalData)
    expect(p.events.at(-1)).toMatchObject({ type: 'coach_note', categories: ['languageDifficulty'], text: 'Prefers Telugu audio' })
    expect(() => addCoachNote(p0, { categories: [] }, at(1))).toThrow(EmptyNote)
    expect(() => addCoachNote(p0, { categories: ['other'], text: 'Her bank account 12345678901' }, at(1), containsPersonalData)).toThrow()
    expect(() => addCoachNote(p0, { categories: ['other'], text: 'x'.repeat(141) }, at(1))).toThrow()
  })
})

describe('9 · recommendations stay within approved financial-literacy content', () => {
  it('every playbook line, in every language, business and level, avoids loans, investment, products and personal data', () => {
    for (const lang of LANGS)
      for (const b of BUSINESSES) {
        const book = PLAYBOOK[lang]
        const lines = [book.start.learn, book.start.action, book.start.activity, book.start.question]
        for (const c of Object.keys(book).filter((k) => k !== 'start') as Concept[]) {
          const t = book[c]
          lines.push(t.learn, t.verify, ...Object.values(t.foundational), ...Object.values(t.intermediate))
        }
        for (const raw of lines) {
          const s = fill(raw, { name: 'Asha', business: b, lang })
          expect(mentionsAdviceTopic(s), s).toBe(false)
          expect(makesUnsupportedClaim(s), s).toBe(false)
          expect(containsPersonalData(s), s).toBe(false)
          expect(s).not.toMatch(/\{\w+\}/)
          const a = exampleAmounts(b)
          for (const n of extractNumbers(s)) expect([a.sales, a.cost, a.left, 3, 5, 1, 2], s).toContain(n.value)
        }
      }
    expect(Object.keys(BUSINESS_WORDS)).toEqual(LANGS)
  })
  it('every recommended lesson is in the approved catalog and every suggested activity is approved', () => {
    const demo = buildDemoLearners(new MemoryStore(), NOW)
    for (const p of demo) {
      const s = sum(p)
      expect(LESSON_CATALOG.find((l) => l.id === s.recommendation.recommendedLessonId)?.status).toBe('approved')
      if (s.challenge.next) expect(CHALLENGES_BY_ID[s.challenge.next.challengeId].status).toBe('approved')
    }
  })
})

describe('optional AI wording: validated, never touches evidence, falls back', () => {
  const src = 'Help Asha see that selling ₹500 of vegetables does not mean she earned ₹500 in profit.'
  it('accepts a faithful rewrite; rejects new amounts, advice, a dropped name or a wrong script', () => {
    expect(validateRewrite(src, 'Show Asha that ₹500 of sales is not ₹500 of profit.', { lang: 'en', name: 'Asha' })).toEqual({ ok: true })
    expect(validateRewrite(src, 'Show Asha that ₹500 of sales leaves ₹250 profit.', { lang: 'en', name: 'Asha' })).toMatchObject({ ok: false, code: 'numbers' })
    expect(validateRewrite(src, 'Tell Asha to take a loan for ₹500 stock.', { lang: 'en', name: 'Asha' })).toMatchObject({ ok: false, code: 'topic' })
    expect(validateRewrite(src, 'Show her that ₹500 of sales is not profit.', { lang: 'en', name: 'Asha' })).toMatchObject({ ok: false, code: 'name_missing' })
    expect(validateRewrite(src, 'Show Asha that ₹500 of sales is not profit.', { lang: 'te', name: 'Asha' })).toMatchObject({ ok: false, code: 'script' })
  })
  it('client: offline, not configured, or an invalid reply → approved wording stays', async () => {
    expect(await requestSimplerWording(src, { lang: 'en', name: 'Asha' }, { isOnline: () => false })).toEqual({ ok: false, reason: 'offline' })
    const f503 = (async () => new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 })) as unknown as typeof fetch
    expect(await requestSimplerWording(src, { lang: 'en', name: 'Asha' }, { fetchImpl: f503, isOnline: () => true })).toEqual({ ok: false, reason: 'not_configured' })
    const bad = (async () => new Response(JSON.stringify({ ok: true, text: 'Asha made ₹999 profit.' }), { status: 200 })) as unknown as typeof fetch
    expect(await requestSimplerWording(src, { lang: 'en', name: 'Asha' }, { fetchImpl: bad, isOnline: () => true })).toMatchObject({ ok: false, reason: 'client_guard:numbers' })
  })
})

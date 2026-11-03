// Coaching assistant logic for field coordinators. Pure and deterministic: no I/O, no clock reads (callers pass
// `now`), no AI. Everything here is DERIVED from one learner's own event log (progress/types.ts), so two learners
// with different histories always get different results, and the same history always gives the same result.
//
// See docs/COACHING_LOGIC.md for every rule, with its id.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept, LessonId, MisconceptionCode, RecommendationReason } from '../assessment/types'
import { ITEMS_BY_ID, LESSON_CATALOG, MISCONCEPTION_TAXONOMY } from '../assessment/bank'
import { MVP_CORE, MVP_SEQUENCE, tierOfItem } from '../assessment/engine'
import { CHALLENGES_BY_ID, mainChallengeFor, planFollowUp } from '../progress/challenges'
import { append, cleanNote, conceptOfLesson, recordPracticeAnswer, startSession } from '../progress/engine'
import type {
  AnswerOutcome,
  ChallengeView,
  CheckInStatus,
  CoachLevel,
  Difficulty,
  LearnerProfile,
  LevelReason,
  NoteCategory,
  ProgressEvent,
  ProgressView,
  SessionStep,
  VerifyResult,
} from '../progress/types'
import type { LessonResult, QuestionId } from '../learning/types'

type Ev<T extends ProgressEvent['type']> = Extract<ProgressEvent, { type: T }>

/** A learner is "inactive" (follow up) after this many days without any activity. */
export const INACTIVE_DAYS = 14
/** Independent first-try correct answers (different questions, after the diagnostic) before the app SUGGESTS a harder level. */
export const MOVE_UP_MIN_INDEPENDENT = 2
/** An agreed activity is due for a check at the next visit once it is this old (coordinators visit about weekly). */
export const CHECKIN_AFTER_DAYS = 2
/** Evidence points shown by default in "Why this lesson?". */
export const DEFAULT_EVIDENCE_SHOWN = 3

// ── Learning level ──────────────────────────────────────────────────

export interface LevelInfo {
  value: CoachLevel
  /** diagnostic = tier from the first check; coach = set by the coordinator (with a reason); none = no check yet. */
  source: 'diagnostic' | 'coach' | 'none'
  diagnosticLevel: CoachLevel | null
  /** SUGGESTION only. The level never changes automatically; the coach decides. */
  suggestion: 'moveUp' | 'moveDown' | null
  /** Independent first-try correct answers since the diagnostic (for the moveUp suggestion). */
  independentCorrect: number
  coachSet: Ev<'coach_level_set'> | null
}

const answersOf = (p: LearnerProfile) => p.events.filter((e): e is Ev<'answer'> => e.type === 'answer')
const conceptOfAnswer = (a: Ev<'answer'>, c: Concept) => a.concept === c || (!!a.misconception && MISCONCEPTION_TAXONOMY[a.misconception].concept === c)

export function learningLevel(p: LearnerProfile, v: ProgressView): LevelInfo {
  const latest = v.assessment.latest
  const diagnosticLevel: CoachLevel | null = latest ? (latest.tier ?? 'foundational') : null
  const coachSet = p.events.filter((e): e is Ev<'coach_level_set'> => e.type === 'coach_level_set').at(-1) ?? null
  const coachLevel = coachSet?.level ?? null
  const value: CoachLevel = coachLevel ?? diagnosticLevel ?? 'foundational'
  const source = coachLevel ? 'coach' : diagnosticLevel ? 'diagnostic' : 'none'

  // Evidence after the diagnostic (or after the coach last set the level, whichever is later).
  const since = Math.max(latest ? p.events.indexOf(latest) : -1, coachSet ? p.events.indexOf(coachSet) : -1)
  const after = answersOf(p).filter((a) => p.events.indexOf(a) > since && a.source !== 'assessment' && a.firstTry && MVP_CORE.includes(a.concept))
  const correctItems = new Set(after.filter((a) => a.outcome === 'correct').map((a) => a.itemKey))
  const missedItems = new Set(after.filter((a) => a.outcome !== 'correct').map((a) => a.itemKey))
  const openCore = v.misconceptions.some((m) => !m.resolved && MVP_CORE.includes(m.concept))
  const lastCore = after.at(-1)

  let suggestion: LevelInfo['suggestion'] = null
  // L2: never promote on one answer. Two different questions right on the first try, nothing open, last answer right.
  if (value === 'foundational' && latest && correctItems.size >= MOVE_UP_MIN_INDEPENDENT && !openCore && lastCore?.outcome === 'correct') suggestion = 'moveUp'
  // L3: intermediate learner who keeps missing the basics on first tries.
  if (value === 'intermediate' && missedItems.size >= 2 && openCore) suggestion = 'moveDown'
  return { value, source, diagnosticLevel, suggestion, independentCorrect: correctItems.size, coachSet }
}

export function setCoachLevel(
  p: LearnerProfile,
  o: { level: CoachLevel | null; reason: LevelReason; note?: string },
  current: CoachLevel,
  now: string,
  screen: (s: string) => boolean = () => false,
): LearnerProfile {
  const note = cleanNote(o.note, screen)
  return append(p, { type: 'coach_level_set', level: o.level, fromLevel: current, reason: o.reason, ...(note ? { note } : {}), at: now })
}

// ── Recommendation with evidence ("Why this lesson?") ───────────────

export type RuleId =
  | 'R0_NO_HISTORY'
  | 'R1_MISCONCEPTION'
  | 'R2_UNSURE'
  | 'R2B_IN_PROGRESS'
  | 'R3_APPLIED_GAP'
  | 'R4_NOT_ASSESSED'
  | 'R5_NEXT_IN_PATH'
  | 'C1_COACH_CHOICE'

const RULE_OF: Record<RecommendationReason, RuleId> = {
  misconception: 'R1_MISCONCEPTION',
  unsure: 'R2_UNSURE',
  applied_gap: 'R3_APPLIED_GAP',
  not_assessed: 'R4_NOT_ASSESSED',
  next_in_path: 'R5_NEXT_IN_PATH',
}

/** One saved fact from the learner's own history. `at` + `eventIndex` point back to the stored event. */
export type Evidence =
  | { kind: 'diagnostic'; eventIndex: number; at: string; itemId: string; tier: CoachLevel; outcome: Exclude<AnswerOutcome, 'correct'>; misconception?: MisconceptionCode; business: Business }
  | { kind: 'diagnosticCorrect'; eventIndex: number; at: string; itemId: string; tier: CoachLevel }
  | { kind: 'lessonMiss'; eventIndex: number; at: string; lessonId: LessonId; question: QuestionId; outcome: Exclude<AnswerOutcome, 'correct'>; misconception?: MisconceptionCode; firstTry: boolean; fixedLater: boolean }
  | { kind: 'practiceMiss'; eventIndex: number; at: string; itemKey: string; byCoach: boolean; outcome: Exclude<AnswerOutcome, 'correct'>; misconception?: MisconceptionCode }
  | { kind: 'practiceCorrect'; at: string; correct: number; total: number }
  | { kind: 'notPractised' }
  | { kind: 'lessonResult'; eventIndex: number; at: string; lessonId: LessonId; result: LessonResult }
  | { kind: 'challenge'; eventIndex: number; at: string; recordId: string; challengeId: string; status: ChallengeView['status']; difficulties: Difficulty[] }
  | { kind: 'verification'; eventIndex: number; at: string; recordId: string; result: VerifyResult }

export interface CoachingRecommendation {
  learnerId: string
  recommendedLessonId: LessonId
  recommendedLevel: CoachLevel
  misconceptionIds: MisconceptionCode[]
  /** All saved evidence for the recommended topic, most relevant first. Never contains anything not in the log. */
  supportingEvidence: Evidence[]
  /** Up to DEFAULT_EVIDENCE_SHOWN points chosen for the default view. */
  keyEvidence: Evidence[]
  /** The rule's reason code (for a coach choice: the rule the app would have used). */
  reason: RecommendationReason | 'no_history'
  /** Playbook reference; the UI fills it in the coach's or learner's language (playbook.ts). */
  suggestedCoachingAction: { topic: Concept | 'start'; level: CoachLevel }
  recommendationRuleId: RuleId
  /** clear = 2+ independent signals of difficulty; limited = 1; none = no difficulty recorded. */
  evidenceStrength: 'clear' | 'limited' | 'none'
  /** Other topics needing work, in learning-path order (why this one comes first). */
  otherNeeds: Concept[]
  /** What the rules recommend, kept intact when a coach overrides. */
  rules: { lessonId: LessonId; ruleId: RuleId; reason: RecommendationReason | 'no_history'; misconceptionIds: MisconceptionCode[] }
  override: { at: string; fromLessonId: LessonId; reason: string; note?: string } | null
  levelSource: LevelInfo['source']
  /** Last time the coach accepted exactly this recommendation (lesson + level + rule), if any. */
  acceptedAt: string | null
}

const isMiss = (o: AnswerOutcome): o is Exclude<AnswerOutcome, 'correct'> => o !== 'correct'

/** Business the learner had when event `idx` happened (questions are rendered for that business). */
export function businessAt(p: LearnerProfile, idx: number): Business {
  const changes = p.events.filter((e): e is Ev<'business_changed'> => e.type === 'business_changed')
  let b: Business = changes[0]?.from ?? p.business
  for (const c of changes) if (p.events.indexOf(c) <= idx) b = c.to
  return b
}

export function buildRecommendation(p: LearnerProfile, v: ProgressView, level: LevelInfo = learningLevel(p, v)): CoachingRecommendation {
  const ev = p.events
  const answers = answersOf(p)
  const noHistory = !v.assessment.latest && answers.length === 0
  let rulesRuleId: RuleId = noHistory ? 'R0_NO_HISTORY' : RULE_OF[v.recommendation.rulesReason]
  // The rules' "unsure" level also covers "started the topic, still practising, lesson not finished".
  // Name that case separately so the explanation never says "she was not sure" without a saved "not sure" answer.
  const rulesConcept = conceptOfLesson(v.recommendation.rulesLessonId)
  if (rulesRuleId === 'R2_UNSURE' && !answers.some((a) => a.source === 'assessment' && a.outcome === 'unsure' && conceptOfAnswer(a, rulesConcept))) rulesRuleId = 'R2B_IN_PROGRESS'
  const lessonId = v.recommendation.lessonId
  const concept = conceptOfLesson(lessonId)

  const evidence: Evidence[] = []
  const mine = answers.filter((a) => conceptOfAnswer(a, concept))
  // Diagnostic answers (latest attempt first; foundational before applied).
  const diag = mine.filter((a) => a.source === 'assessment' && ITEMS_BY_ID[a.itemKey])
  const diagMisses = diag.filter((a) => isMiss(a.outcome))
  diagMisses
    .sort((a, b) => ev.indexOf(b) - ev.indexOf(a) || (tierOfItem(ITEMS_BY_ID[a.itemKey]) === 'foundational' ? -1 : 1))
    .forEach((a) =>
      evidence.push({
        kind: 'diagnostic',
        eventIndex: ev.indexOf(a),
        at: a.at,
        itemId: a.itemKey,
        tier: tierOfItem(ITEMS_BY_ID[a.itemKey]),
        outcome: a.outcome as Exclude<AnswerOutcome, 'correct'>,
        ...(a.misconception ? { misconception: a.misconception } : {}),
        business: businessAt(p, ev.indexOf(a)),
      }),
    )
  // Lesson and practice answers on the same topic.
  const later = mine.filter((a) => a.source !== 'assessment' && !a.itemKey.startsWith('coach:verify:')) // verification has its own evidence
  const laterMisses = later.filter((a) => isMiss(a.outcome)).reverse()
  for (const a of laterMisses) {
    const i = ev.indexOf(a)
    if (a.source === 'lesson') {
      const q = a.itemKey.split(':')[2] as QuestionId
      const fixedLater = later.some((b) => b.itemKey === a.itemKey && b.outcome === 'correct' && ev.indexOf(b) > i)
      evidence.push({ kind: 'lessonMiss', eventIndex: i, at: a.at, lessonId: a.lessonId ?? lessonId, question: q, outcome: a.outcome as Exclude<AnswerOutcome, 'correct'>, ...(a.misconception ? { misconception: a.misconception } : {}), firstTry: a.firstTry, fixedLater })
    } else {
      evidence.push({ kind: 'practiceMiss', eventIndex: i, at: a.at, itemKey: a.itemKey, byCoach: a.itemKey.startsWith('coach:'), outcome: a.outcome as Exclude<AnswerOutcome, 'correct'>, ...(a.misconception ? { misconception: a.misconception } : {}) })
    }
  }
  const practiceSignal: Evidence = later.length
    ? { kind: 'practiceCorrect', at: later.at(-1)!.at, correct: later.filter((a) => a.outcome === 'correct').length, total: later.length }
    : { kind: 'notPractised' }
  if (!laterMisses.length) evidence.push(practiceSignal)
  // Lesson result, weekly activity and the coach's check of it.
  const done = ev.filter((e): e is Ev<'lesson_completed'> => e.type === 'lesson_completed' && conceptOfLesson(e.lessonId) === concept).at(-1)
  if (done) evidence.push({ kind: 'lessonResult', eventIndex: ev.indexOf(done), at: done.at, lessonId: done.lessonId, result: done.result })
  const ch = [...v.challenges].reverse().find((c) => c.concept === concept && c.status !== 'replaced')
  if (ch) {
    const e = ev.find((x) => x.type === 'challenge_assigned' && x.recordId === ch.recordId)!
    evidence.push({ kind: 'challenge', eventIndex: ev.indexOf(e), at: ch.checkIn?.at ?? ch.assignedAt, recordId: ch.recordId, challengeId: ch.challengeId, status: ch.status, difficulties: ch.checkIn?.difficulties ?? [] })
    const ver = ev.filter((x): x is Ev<'challenge_verified'> => x.type === 'challenge_verified' && x.recordId === ch.recordId).at(-1)
    if (ver) evidence.push({ kind: 'verification', eventIndex: ev.indexOf(ver), at: ver.at, recordId: ver.recordId, result: ver.result })
  }
  // Next-in-path: show what she got right, so the coach sees why nothing earlier is flagged.
  if (rulesRuleId === 'R5_NEXT_IN_PATH' && !diagMisses.length) {
    const ok = answers.filter((a) => a.source === 'assessment' && a.outcome === 'correct' && ITEMS_BY_ID[a.itemKey]).at(-1)
    if (ok) evidence.unshift({ kind: 'diagnosticCorrect', eventIndex: ev.indexOf(ok), at: ok.at, itemId: ok.itemKey, tier: tierOfItem(ITEMS_BY_ID[ok.itemKey]) })
  }

  // Strength: independent signals of difficulty (diagnostic / lesson / practice / activity not done / could not explain).
  const signals = new Set<string>()
  if (diagMisses.length) signals.add('diagnostic')
  if (laterMisses.some((a) => a.source === 'lesson')) signals.add('lesson')
  if (laterMisses.some((a) => a.source === 'practice')) signals.add('practice')
  if (ch && (ch.status === 'notYet' || ch.status === 'partly')) signals.add('challenge')
  if (evidence.some((e) => e.kind === 'verification' && e.result !== 'explained')) signals.add('verification')
  const evidenceStrength = signals.size >= 2 ? 'clear' : signals.size === 1 ? 'limited' : 'none'

  // Default view: the first diagnostic point, the practice point, then activity / lesson result.
  const pick = (k: Evidence['kind'][]) => evidence.find((e) => k.includes(e.kind))
  const keyEvidence = [
    pick(['diagnostic', 'diagnosticCorrect']),
    pick(['lessonMiss', 'practiceMiss']) ?? (evidence.includes(practiceSignal) ? practiceSignal : undefined),
    pick(['verification']) ?? pick(['challenge']) ?? pick(['lessonResult']),
  ].filter((e): e is Evidence => !!e).slice(0, DEFAULT_EVIDENCE_SHOWN)

  const open = v.misconceptions.filter((m) => !m.resolved && m.concept === concept).map((m) => m.code)
  const fromDiag = [...new Set(diagMisses.map((a) => a.misconception).filter((m): m is MisconceptionCode => !!m))]
  const misconceptionIds = open.length ? open : fromDiag

  const otherNeeds = MVP_SEQUENCE.filter((c) => c !== concept && (v.recommendation.alsoReview.includes(c) || v.concepts[c].needsPractice))
  const rulesReason = noHistory ? 'no_history' : v.recommendation.rulesReason
  const override = v.recommendation.source === 'coach' ? v.recommendation.override : null
  const recommendationRuleId: RuleId = override ? 'C1_COACH_CHOICE' : rulesRuleId
  const accepted = ev.filter((e): e is Ev<'coach_accepted'> => e.type === 'coach_accepted').at(-1)

  return {
    learnerId: p.learnerId,
    recommendedLessonId: lessonId,
    recommendedLevel: level.value,
    misconceptionIds,
    supportingEvidence: evidence,
    keyEvidence,
    reason: rulesReason,
    suggestedCoachingAction: { topic: noHistory ? 'start' : concept, level: level.value },
    recommendationRuleId,
    evidenceStrength,
    otherNeeds,
    rules: { lessonId: v.recommendation.rulesLessonId, ruleId: rulesRuleId, reason: rulesReason, misconceptionIds: v.misconceptions.filter((m) => !m.resolved && m.concept === rulesConcept).map((m) => m.code) },
    override: override ? { at: override.at, fromLessonId: override.fromLessonId, reason: override.reason, ...(override.note ? { note: override.note } : {}) } : null,
    levelSource: level.source,
    acceptedAt: accepted && accepted.lessonId === lessonId && accepted.level === level.value && accepted.ruleId === recommendationRuleId ? accepted.at : null,
  }
}

export const acceptRecommendation = (p: LearnerProfile, r: CoachingRecommendation, now: string) =>
  append(p, { type: 'coach_accepted', lessonId: r.recommendedLessonId, level: r.recommendedLevel, ruleId: r.recommendationRuleId, at: now })

// ── Weekly activity follow-up ───────────────────────────────────────

export type FollowUpRule = 'F1_ASK' | 'F2_VERIFY' | 'F3_EXPLAINED' | 'F3B_REVISIT' | 'F4_PARTLY' | 'F5_UNCLEAR' | 'F6_PRACTICAL' | 'F0_NONE'

export interface ChallengeTracking {
  /** The activity to talk about now: due for a check, or the most recently checked one. */
  last: ChallengeView | null
  /** Coach's check of whether she can explain it (done ≠ understood). */
  verification: VerifyResult | null
  displayStatus: 'completed' | 'partly' | 'notCompleted' | 'notChecked' | null
  followUpRule: FollowUpRule
  /** The activity she is doing now / next (already agreed, or the rule's suggestion). */
  next: { challengeId: string; agreed: boolean; recordId?: string } | null
}

export function challengeTracking(p: LearnerProfile, v: ProgressView, recLessonId: LessonId, now: string): ChallengeTracking {
  const active = v.activeChallenge
  const due = !!active && (v.checkInDue || Date.parse(now) - Date.parse(active.assignedAt) >= CHECKIN_AFTER_DAYS * 86400_000)
  const dueActive = active && due ? active : null
  const checked = [...v.challenges].reverse().find((c) => c.status === 'done' || c.status === 'partly' || c.status === 'notYet') ?? null
  const last = dueActive ?? checked
  const verification = last ? (p.events.filter((e): e is Ev<'challenge_verified'> => e.type === 'challenge_verified' && e.recordId === last.recordId).at(-1)?.result ?? null) : null
  const displayStatus: ChallengeTracking['displayStatus'] = !last
    ? null
    : last.status === 'done'
      ? 'completed'
      : last.status === 'partly'
        ? 'partly'
        : last.status === 'notYet'
          ? 'notCompleted'
          : 'notChecked'
  const diffs = last?.checkIn?.difficulties ?? []
  const unclear = diffs.some((d) => d === 'notClear' || d === 'hardToCount')
  const followUpRule: FollowUpRule = !last
    ? 'F0_NONE'
    : displayStatus === 'notChecked'
      ? 'F1_ASK'
      : displayStatus === 'completed'
        ? !verification
          ? 'F2_VERIFY'
          : verification === 'explained'
            ? 'F3_EXPLAINED'
            : 'F3B_REVISIT'
        : displayStatus === 'partly'
          ? 'F4_PARTLY'
          : unclear
            ? 'F5_UNCLEAR'
            : 'F6_PRACTICAL'
  let next: ChallengeTracking['next'] = null
  if (active && active !== dueActive) next = { challengeId: active.challengeId, agreed: true, recordId: active.recordId }
  else if (last && last.status !== 'assigned') {
    const plan = planFollowUp(last.challengeId, last.status as CheckInStatus, diffs)
    if (plan.challengeId) next = { challengeId: plan.challengeId, agreed: false }
  }
  if (!next && !dueActive) {
    const main = mainChallengeFor(recLessonId)
    if (main) next = { challengeId: main.id, agreed: false }
  }
  return { last, verification, displayStatus, followUpRule, next }
}

/** Coach checks whether she can explain an activity she did. Also recorded as evidence for the topic. */
export function verifyChallenge(p: LearnerProfile, recordId: string, result: VerifyResult, v: ProgressView, now: string): LearnerProfile {
  const rec = v.challenges.find((c) => c.recordId === recordId)
  if (!rec) throw new Error(`Unknown challenge record ${recordId}`)
  const outcome: AnswerOutcome = result === 'explained' ? 'correct' : result === 'partly' ? 'unsure' : 'incorrect'
  return recordPracticeAnswer(
    append(p, { type: 'challenge_verified', recordId, result, at: now }),
    { concept: rec.concept, itemKey: `coach:verify:${recordId}`, outcome, firstTry: !p.events.some((e) => e.type === 'challenge_verified' && e.recordId === recordId) },
    now,
  )
}

// ── Coach notes ─────────────────────────────────────────────────────

export class EmptyNote extends Error {}

export function addCoachNote(
  p: LearnerProfile,
  o: { categories: NoteCategory[]; text?: string; sessionId?: string },
  now: string,
  screen: (s: string) => boolean = () => false,
): LearnerProfile {
  const text = cleanNote(o.text, screen)
  const categories = [...new Set(o.categories)]
  if (!categories.length && !text) throw new EmptyNote('empty')
  return append(p, { type: 'coach_note', categories, ...(text ? { text } : {}), ...(o.sessionId ? { sessionId: o.sessionId } : {}), at: now })
}

export const notesOf = (p: LearnerProfile) => p.events.filter((e): e is Ev<'coach_note'> => e.type === 'coach_note').reverse()

// ── Guided coaching session ─────────────────────────────────────────

export interface CoachSessionView {
  sessionId: string
  lessonId: LessonId
  level: CoachLevel
  ruleId: string
  startedAt: string
  step: SessionStep
  status: 'open' | 'paused' | 'completed'
  completedAt: string | null
  visited: SessionStep[]
  /** What was actually recorded during the session (from the log, not from the UI). */
  recorded: { checkedIn: boolean; verified: boolean; practiced: number; practiceCorrect: number; assigned: string | null; notes: number }
}

export function sessionsOf(p: LearnerProfile): CoachSessionView[] {
  const ev = p.events
  return ev
    .filter((e): e is Ev<'coach_session_started'> => e.type === 'coach_session_started')
    .map((s) => {
      const start = ev.indexOf(s)
      const done = ev.find((e, i) => i > start && e.type === 'coach_session_completed' && e.sessionId === s.sessionId) as Ev<'coach_session_completed'> | undefined
      const end = done ? ev.indexOf(done) : ev.length
      const inRange = ev.slice(start, end + 1)
      const mineEv = inRange.filter((e) => 'sessionId' in e && e.sessionId === s.sessionId)
      const steps = mineEv.filter((e): e is Ev<'coach_session_step'> => e.type === 'coach_session_step').map((e) => e.step)
      const lastMarker = [...mineEv].reverse().find((e) => e.type === 'coach_session_step' || e.type === 'coach_session_paused') as Ev<'coach_session_step' | 'coach_session_paused'> | undefined
      const practice = inRange.filter((e): e is Ev<'answer'> => e.type === 'answer' && e.itemKey.startsWith(`coach:${s.sessionId}:`))
      const assigned = inRange.filter((e): e is Ev<'challenge_assigned'> => e.type === 'challenge_assigned').at(-1)
      return {
        sessionId: s.sessionId,
        lessonId: s.lessonId,
        level: s.level,
        ruleId: s.ruleId,
        startedAt: s.at,
        step: lastMarker?.step ?? 'checkin',
        status: done ? 'completed' : lastMarker?.type === 'coach_session_paused' ? 'paused' : 'open',
        completedAt: done?.at ?? null,
        visited: [...new Set(steps)],
        recorded: {
          checkedIn: inRange.some((e) => e.type === 'challenge_checkin' && e.by === 'coach'),
          verified: inRange.some((e) => e.type === 'challenge_verified'),
          practiced: practice.length,
          practiceCorrect: practice.filter((a) => a.outcome === 'correct').length,
          assigned: assigned?.challengeId ?? null,
          notes: inRange.filter((e) => e.type === 'coach_note' && e.sessionId === s.sessionId).length,
        },
      }
    })
}

export const openSessionOf = (p: LearnerProfile) => sessionsOf(p).filter((s) => s.status !== 'completed').at(-1) ?? null

/** Starts a guided session (or returns the profile unchanged if one is already open: resume it instead). */
export function startCoachSession(p: LearnerProfile, r: CoachingRecommendation, now: string): { profile: LearnerProfile; sessionId: string } {
  const open = openSessionOf(p)
  if (open) return { profile: p, sessionId: open.sessionId }
  const n = p.events.filter((e) => e.type === 'coach_session_started').length + 1
  const sessionId = `${p.learnerId}-cs${n}`
  const profile = append(
    startSession(p, 'coach', now),
    { type: 'coach_session_started', sessionId, lessonId: r.recommendedLessonId, level: r.recommendedLevel, ruleId: r.recommendationRuleId, at: now },
    { type: 'coach_session_step', sessionId, step: 'checkin', at: now },
  )
  return { profile, sessionId }
}

function requireOpen(p: LearnerProfile, sessionId: string) {
  const s = sessionsOf(p).find((x) => x.sessionId === sessionId)
  if (!s) throw new Error(`Unknown session ${sessionId}`)
  if (s.status === 'completed') throw new Error(`Session ${sessionId} is already complete`)
  return s
}

export function setSessionStep(p: LearnerProfile, sessionId: string, step: SessionStep, now: string): LearnerProfile {
  const s = requireOpen(p, sessionId)
  return s.step === step && s.status === 'open' ? p : append(p, { type: 'coach_session_step', sessionId, step, at: now })
}

export function pauseSession(p: LearnerProfile, sessionId: string, now: string): LearnerProfile {
  const s = requireOpen(p, sessionId)
  return append(p, { type: 'coach_session_paused', sessionId, step: s.step, at: now })
}

export function completeSession(p: LearnerProfile, sessionId: string, now: string): LearnerProfile {
  requireOpen(p, sessionId)
  return append(p, { type: 'coach_session_completed', sessionId, at: now })
}

/** A practice answer given during a coaching session (recorded as practice evidence for the topic). */
export function recordSessionPractice(
  p: LearnerProfile,
  sessionId: string,
  a: { concept: Concept; question: string; outcome: AnswerOutcome; misconception?: MisconceptionCode },
  now: string,
): LearnerProfile {
  requireOpen(p, sessionId)
  const itemKey = `coach:${sessionId}:${a.question}`
  const firstTry = !p.events.some((e) => e.type === 'answer' && e.itemKey === itemKey)
  return recordPracticeAnswer(p, { concept: a.concept, itemKey, outcome: a.outcome, ...(a.misconception ? { misconception: a.misconception } : {}), firstTry }, now)
}

// ── Status and coach home ───────────────────────────────────────────

export type CoachStatus = 'followUp' | 'needsPractice' | 'doingWell'
export type StatusReason =
  | 'noCheckYet'
  | 'sessionPaused'
  | 'challengeNotChecked'
  | 'challengeToVerify'
  | 'challengeBarrier'
  | 'inactive'
  | 'openMisconception'
  | 'conceptNeedsPractice'
  | 'couldNotExplain'
  | 'onTrack'

export interface CoachSummary {
  learnerId: string
  status: CoachStatus
  reasons: StatusReason[]
  level: LevelInfo
  recommendation: CoachingRecommendation
  challenge: ChallengeTracking
  openSession: CoachSessionView | null
  sessions: CoachSessionView[]
  lessonsCompleted: LessonId[]
  understood: Concept[]
  needsPractice: Concept[]
  readyForNextLesson: boolean
  active: boolean
}

export function coachSummary(p: LearnerProfile, v: ProgressView, now: string): CoachSummary {
  const level = learningLevel(p, v)
  const recommendation = buildRecommendation(p, v, level)
  const challenge = challengeTracking(p, v, recommendation.recommendedLessonId, now)
  const sessions = sessionsOf(p)
  const openSession = sessions.filter((s) => s.status !== 'completed').at(-1) ?? null
  const noHistory = recommendation.recommendationRuleId === 'R0_NO_HISTORY' || (!v.assessment.latest && !answersOf(p).length)

  const reasons: StatusReason[] = []
  if (noHistory) reasons.push('noCheckYet')
  if (openSession) reasons.push('sessionPaused')
  if (challenge.followUpRule === 'F1_ASK') reasons.push('challengeNotChecked')
  if (challenge.followUpRule === 'F2_VERIFY') reasons.push('challengeToVerify')
  if (challenge.followUpRule === 'F4_PARTLY' || challenge.followUpRule === 'F5_UNCLEAR' || challenge.followUpRule === 'F6_PRACTICAL') {
    // Cleared once a smaller/easier follow-up was agreed for that activity.
    const handled = !!challenge.last && v.challenges.some((c) => c.followUpOf === challenge.last!.recordId)
    if (!handled) reasons.push('challengeBarrier')
  }
  const lastAt = v.lastActivityAt ?? p.createdAt
  const active = Date.parse(now) - Date.parse(lastAt) <= INACTIVE_DAYS * 86400_000 || Date.parse(now) - Date.parse(p.createdAt) <= INACTIVE_DAYS * 86400_000
  if (!active) reasons.push('inactive')
  const followUp = reasons.length > 0

  const needs = MVP_SEQUENCE.filter((c) => v.concepts[c].needsPractice)
  if (v.misconceptions.some((m) => !m.resolved)) reasons.push('openMisconception')
  if (needs.length) reasons.push('conceptNeedsPractice')
  if (challenge.verification === 'notYet' || challenge.verification === 'partly') reasons.push('couldNotExplain')
  const status: CoachStatus = followUp ? 'followUp' : reasons.length ? 'needsPractice' : 'doingWell'
  if (!reasons.length) reasons.push('onTrack')

  const lessonsCompleted = LESSON_CATALOG.filter((l) => v.lessons[l.id].completions > 0).map((l) => l.id)
  const understood = MVP_SEQUENCE.filter((c) => v.concepts[c].level === 'demonstrated')
  const readyForNextLesson =
    lessonsCompleted.length > 0 &&
    v.lessons[recommendation.recommendedLessonId].status === 'notStarted' &&
    lessonsCompleted.every((l) => !v.concepts[conceptOfLesson(l)].needsPractice)

  return { learnerId: p.learnerId, status, reasons, level, recommendation, challenge, openSession, sessions, lessonsCompleted, understood, needsPractice: needs, readyForNextLesson, active }
}

export const STATUS_ORDER: Record<CoachStatus, number> = { followUp: 0, needsPractice: 1, doingWell: 2 }

export interface CoachHomeCounts {
  active: number
  needAttention: number
  challengesToFollowUp: number
  readyForNext: number
}

export function homeCounts(rows: CoachSummary[]): CoachHomeCounts {
  return {
    active: rows.filter((r) => r.active).length,
    needAttention: rows.filter((r) => r.status !== 'doingWell').length,
    challengesToFollowUp: rows.filter((r) => r.reasons.some((x) => x === 'challengeNotChecked' || x === 'challengeToVerify' || x === 'challengeBarrier')).length,
    readyForNext: rows.filter((r) => r.readyForNextLesson).length,
  }
}

export const challengeExists = (id: string) => !!CHALLENGES_BY_ID[id]

/** Language-neutral check used by tests: does every evidence item point at a real stored event? */
export function evidenceIsGrounded(p: LearnerProfile, r: CoachingRecommendation): boolean {
  return r.supportingEvidence.every((e) => {
    if (e.kind === 'notPractised' || e.kind === 'practiceCorrect') return true
    const stored = p.events[e.eventIndex]
    if (!stored) return false
    if (e.kind === 'challenge') return stored.type === 'challenge_assigned' && stored.recordId === e.recordId && stored.challengeId === e.challengeId
    if (stored.at !== e.at) return false
    switch (e.kind) {
      case 'diagnostic':
        return stored.type === 'answer' && stored.source === 'assessment' && stored.itemKey === e.itemId && stored.outcome === e.outcome
      case 'diagnosticCorrect':
        return stored.type === 'answer' && stored.source === 'assessment' && stored.outcome === 'correct'
      case 'lessonMiss':
        return stored.type === 'answer' && stored.source === 'lesson' && stored.outcome === e.outcome
      case 'practiceMiss':
        return stored.type === 'answer' && stored.source === 'practice' && stored.itemKey === e.itemKey && stored.outcome === e.outcome
      case 'lessonResult':
        return stored.type === 'lesson_completed' && stored.result === e.result
      case 'verification':
        return stored.type === 'challenge_verified' && stored.result === e.result
      default:
        return false
    }
  })
}

export type { Lang }

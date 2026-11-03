// Pure, deterministic learner-progress logic: event creation (immutable) and the derived progress view.
// No I/O, no clock reads (callers pass `now`), no AI.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import { CONCEPTS, type AssessmentResult, type Concept, type ConceptLevel, type LessonId, type MisconceptionCode, type ScoredAnswer } from '../assessment/types'
import { ITEMS_BY_ID, LESSON_CATALOG, MISCONCEPTION_TAXONOMY } from '../assessment/bank'
import { recommend } from '../assessment/engine'
import type { LessonResult, OptionOutcome, QuestionId, StepId } from '../learning/types'
import { CHALLENGES_BY_ID, planFollowUp, type FollowUpPlan } from './challenges'
import {
  PROGRESS_SCHEMA_VERSION,
  type AnswerOutcome,
  type AnswerSource,
  type ChallengeView,
  type CheckInStatus,
  type ConceptProgress,
  type Difficulty,
  type LearnerProfile,
  type LessonProgress,
  type MisconceptionView,
  type OverrideReason,
  type ProgressEvent,
  type ProgressView,
  type UnderstandingLevel,
} from './types'

/** A new session starts when the learner returns after this long (or when a coach starts one). */
export const SESSION_GAP_HOURS = 4
/** Free-text notes (difficulty notes, coach notes) are short and optional. */
export const MAX_NOTE = 140

type Ev<T extends ProgressEvent['type']> = Extract<ProgressEvent, { type: T }>

// ── Profile + events ─────────────────────────────────────────────────

export function createProfile(o: { learnerId: string; alias: Record<Lang, string>; language: Lang; business: Business; now: string; isDemo?: boolean; onboarded?: boolean }): LearnerProfile {
  if (!/^[A-Z]{2}-\d{2,4}$/.test(o.learnerId)) throw new Error(`Learner IDs are fictional codes like "DL-01", got "${o.learnerId}"`)
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    learnerId: o.learnerId,
    alias: o.alias,
    isDemo: o.isDemo ?? true,
    language: o.language,
    business: o.business,
    onboarded: o.onboarded ?? false,
    createdAt: o.now,
    events: [],
  }
}

export function append(p: LearnerProfile, ...events: ProgressEvent[]): LearnerProfile {
  return events.length ? { ...p, events: [...p.events, ...events] } : p
}

/** Language is a display preference: switching it never touches progress events. */
export function setLanguage(p: LearnerProfile, to: Lang, now: string): LearnerProfile {
  if (p.language === to) return p
  return append({ ...p, language: to }, { type: 'language_changed', from: p.language, to, at: now })
}

export function setBusiness(p: LearnerProfile, to: Business, now: string): LearnerProfile {
  if (p.business === to) return p
  return append({ ...p, business: to }, { type: 'business_changed', from: p.business, to, at: now })
}

export const markOnboarded = (p: LearnerProfile): LearnerProfile => (p.onboarded ? p : { ...p, onboarded: true })

export function startSession(p: LearnerProfile, by: 'coach' | 'learner', now: string): LearnerProfile {
  return append(p, { type: 'session_started', by, at: now })
}

/** Starts a learner session if there is none yet, or the last activity was more than SESSION_GAP_HOURS ago. */
export function ensureSession(p: LearnerProfile, now: string): LearnerProfile {
  const sessions = p.events.filter((e) => e.type === 'session_started')
  const last = p.events.at(-1)?.at
  const stale = !last || Date.parse(now) - Date.parse(last) > SESSION_GAP_HOURS * 3600_000
  return !sessions.length || stale ? startSession(p, 'learner', now) : p
}

export function recordAssessment(p: LearnerProfile, r: AssessmentResult, now: string): LearnerProfile {
  return append(
    p,
    ...r.answers.map(
      (a): ProgressEvent => ({
        type: 'answer',
        source: 'assessment',
        concept: a.concept,
        itemKey: a.itemId,
        outcome: a.outcome.kind,
        ...(a.outcome.kind === 'misconception' ? { misconception: a.outcome.code } : {}),
        firstTry: true,
        at: a.answeredAt ?? now,
      }),
    ),
    {
      type: 'assessment_completed',
      attempt: r.attempt,
      conceptLevels: r.conceptLevels,
      misconceptions: r.misconceptions,
      recommendedLessonId: r.recommendation.lessonId,
      ...(r.tier ? { tier: r.tier } : {}),
      ...(r.mainMisconceptions ? { mainMisconceptions: r.mainMisconceptions } : {}),
      at: now,
    },
  )
}

export const lessonStarted = (p: LearnerProfile, lessonId: LessonId, now: string) => append(p, { type: 'lesson_started', lessonId, at: now })

export function recordLessonAnswer(
  p: LearnerProfile,
  a: { lessonId: LessonId; concept: Concept; question: QuestionId; outcome: OptionOutcome; attemptNumber: number },
  now: string,
): LearnerProfile {
  return append(p, {
    type: 'answer',
    source: 'lesson',
    concept: a.concept,
    lessonId: a.lessonId,
    itemKey: `lesson:${a.lessonId}:${a.question}`,
    outcome: a.outcome.kind,
    ...(a.outcome.kind === 'misconception' ? { misconception: a.outcome.code } : {}),
    firstTry: a.attemptNumber === 1,
    at: now,
  })
}

export function recordPracticeAnswer(
  p: LearnerProfile,
  a: { concept: Concept; itemKey: string; outcome: AnswerOutcome; misconception?: MisconceptionCode; firstTry: boolean },
  now: string,
): LearnerProfile {
  return append(p, { type: 'answer', source: 'practice', ...a, at: now })
}

export const completeLesson = (p: LearnerProfile, lessonId: LessonId, result: LessonResult, now: string) =>
  append(p, { type: 'lesson_completed', lessonId, result, at: now })

export function assignChallenge(p: LearnerProfile, challengeId: string, now: string, followUpOf?: string): LearnerProfile {
  const spec = CHALLENGES_BY_ID[challengeId]
  if (!spec || spec.status !== 'approved') throw new Error(`Not an approved challenge: ${challengeId}`)
  const n = p.events.filter((e) => e.type === 'challenge_assigned').length + 1
  return append(p, {
    type: 'challenge_assigned',
    recordId: `${p.learnerId}-ch${n}`,
    challengeId,
    lessonId: spec.lessonId,
    concept: spec.concept,
    ...(followUpOf ? { followUpOf } : {}),
    at: now,
  })
}

export const declineChallenge = (p: LearnerProfile, challengeId: string, now: string) =>
  append(p, { type: 'challenge_declined', challengeId, lessonId: CHALLENGES_BY_ID[challengeId].lessonId, at: now })

export class NoteRejected extends Error {}

/** Learner reports on an activity. Returns the follow-up plan; it is only assigned if the learner accepts it. */
export function checkInChallenge(
  p: LearnerProfile,
  recordId: string,
  status: CheckInStatus,
  difficulties: Difficulty[],
  note: string | undefined,
  now: string,
  screen: (note: string) => boolean = () => false,
  by?: 'coach',
): { profile: LearnerProfile; plan: FollowUpPlan } {
  const rec = challengeViews(p.events).find((c) => c.recordId === recordId)
  if (!rec) throw new Error(`Unknown challenge record ${recordId}`)
  if (rec.status !== 'assigned') throw new Error(`Challenge ${recordId} was already checked in`)
  const clean = cleanNote(note, screen)
  const plan = planFollowUp(rec.challengeId, status, status === 'done' ? [] : difficulties)
  const profile = append(p, {
    type: 'challenge_checkin',
    recordId,
    status,
    difficulties: [...new Set(difficulties)],
    ...(clean ? { note: clean } : {}),
    offeredFollowUpId: plan.challengeId,
    ...(by ? { by } : {}),
    at: now,
  })
  return { profile, plan }
}

/** Notes are optional, trimmed, ≤ MAX_NOTE chars, and refused if they look like personal or banking data. */
export function cleanNote(note: string | undefined, looksPersonal: (s: string) => boolean): string | undefined {
  const n = note?.trim()
  if (!n) return undefined
  if (n.length > MAX_NOTE) throw new NoteRejected('too_long')
  if (looksPersonal(n)) throw new NoteRejected('personal')
  return n
}

export function coachOverride(
  p: LearnerProfile,
  o: { fromLessonId: LessonId; toLessonId: LessonId | null; reason: OverrideReason; note?: string; ruleId?: string },
  now: string,
  screen: (note: string) => boolean = () => false,
): LearnerProfile {
  if (o.toLessonId && !LESSON_CATALOG.some((l) => l.id === o.toLessonId && l.status === 'approved')) throw new Error(`Not an approved lesson: ${o.toLessonId}`)
  const note = cleanNote(o.note, screen)
  return append(p, { type: 'coach_override', fromLessonId: o.fromLessonId, toLessonId: o.toLessonId, reason: o.reason, ...(note ? { note } : {}), ...(o.ruleId ? { ruleId: o.ruleId } : {}), at: now })
}

export const coachReviewedLesson = (p: LearnerProfile, lessonId: LessonId, now: string) => append(p, { type: 'coach_reviewed_lesson', lessonId, at: now })

// ── Derived view ─────────────────────────────────────────────────────

function challengeViews(events: ProgressEvent[]): ChallengeView[] {
  const out: ChallengeView[] = []
  let session = 0
  for (const e of events) {
    if (e.type === 'session_started') session++
    if (e.type === 'challenge_assigned') {
      for (const c of out) if (c.status === 'assigned') c.status = 'replaced'
      out.push({
        recordId: e.recordId,
        challengeId: e.challengeId,
        lessonId: e.lessonId,
        concept: e.concept,
        assignedAt: e.at,
        session,
        followUpOf: e.followUpOf ?? null,
        status: 'assigned',
        checkIn: null,
      })
    }
    if (e.type === 'challenge_checkin') {
      const c = out.find((x) => x.recordId === e.recordId)
      if (c && c.status === 'assigned') {
        c.status = e.status
        c.checkIn = { at: e.at, difficulties: e.difficulties, ...(e.note ? { note: e.note } : {}), offeredFollowUpId: e.offeredFollowUpId }
      }
    }
  }
  return out
}

const conceptOfLesson = (lessonId: LessonId): Concept => LESSON_CATALOG.find((l) => l.id === lessonId)!.concept

export function deriveProgress(p: LearnerProfile, opts: { resumeStep?: (lessonId: LessonId) => StepId | null } = {}): ProgressView {
  const ev = p.events
  const answers = ev.filter((e): e is Ev<'answer'> => e.type === 'answer')
  const assessments = ev.filter((e): e is Ev<'assessment_completed'> => e.type === 'assessment_completed')
  const latestAssessment = assessments.at(-1) ?? null
  const completions = ev.filter((e): e is Ev<'lesson_completed'> => e.type === 'lesson_completed')
  const starts = ev.filter((e): e is Ev<'lesson_started'> => e.type === 'lesson_started')

  // Misconceptions: seen in any answer; resolved by a later correct answer on the same concept.
  const misconceptions: MisconceptionView[] = []
  answers.forEach((a, i) => {
    if (a.outcome !== 'misconception' || !a.misconception) return
    const concept = MISCONCEPTION_TAXONOMY[a.misconception].concept
    let m = misconceptions.find((x) => x.code === a.misconception)
    if (!m) misconceptions.push((m = { code: a.misconception, concept, count: 0, firstSeenAt: a.at, lastSeenAt: a.at, resolved: false }))
    m.count++
    m.lastSeenAt = a.at
    m.resolved = answers.slice(i + 1).some((b) => b.outcome === 'correct' && (b.concept === a.concept || b.concept === concept))
  })
  // A later miss re-opens it; recompute resolution from the last sighting.
  for (const m of misconceptions) {
    const lastIdx = answers.map((a) => a.misconception === m.code).lastIndexOf(true)
    const seenOn = answers[lastIdx].concept
    m.resolved = answers.slice(lastIdx + 1).some((b) => b.outcome === 'correct' && (b.concept === seenOn || b.concept === m.concept))
  }
  const open = misconceptions.filter((m) => !m.resolved)

  // Lessons
  const lessons = Object.fromEntries(
    LESSON_CATALOG.map((l): [LessonId, LessonProgress] => {
      const s = starts.filter((e) => e.lessonId === l.id)
      const c = completions.filter((e) => e.lessonId === l.id)
      const lastStart = s.at(-1)?.at
      const lastDone = c.at(-1)
      const step = opts.resumeStep?.(l.id) ?? null
      const restartedAfterDone = !!lastStart && (!lastDone || ev.indexOf(s.at(-1)!) > ev.indexOf(lastDone))
      const inProgress = restartedAfterDone && step !== 'complete'
      return [
        l.id,
        {
          lessonId: l.id,
          status: inProgress ? 'inProgress' : c.length ? 'completed' : s.length ? 'inProgress' : 'notStarted',
          starts: s.length,
          completions: c.length,
          lastResult: lastDone?.result ?? null,
          lastCompletedAt: lastDone?.at ?? null,
          resumeStep: inProgress && step ? step : null,
        },
      ]
    }),
  ) as Record<LessonId, LessonProgress>

  // Concepts
  const concepts = Object.fromEntries(
    CONCEPTS.map((c): [Concept, ConceptProgress] => {
      const mine = answers.filter((a) => a.concept === c)
      const practiced = mine.some((a) => a.source !== 'assessment')
      const lessonIds = LESSON_CATALOG.filter((l) => l.concept === c).map((l) => l.id)
      const started = starts.some((s) => lessonIds.includes(s.lessonId))
      const lastCompletion = completions.filter((e) => lessonIds.includes(e.lessonId)).at(-1)
      const firstTries = mine.filter((a) => a.firstTry)
      const [x, y] = firstTries.slice(-2)
      const twoIndependent = !!x && !!y && x.outcome === 'correct' && y.outcome === 'correct' && x.itemKey !== y.itemKey
      const last = mine.at(-1)
      const missAfterUnderstood = lastCompletion && mine.some((a) => a.outcome !== 'correct' && ev.indexOf(a) > ev.indexOf(lastCompletion))
      const demonstrated = (twoIndependent && last?.outcome === 'correct') || (lastCompletion?.result === 'understood' && !missAfterUnderstood)

      let level: UnderstandingLevel = 'notStarted'
      if (mine.length || started) level = 'introduced'
      if (practiced) level = 'practicing'
      if (demonstrated) level = 'demonstrated'

      const reasons: ConceptProgress['needsPracticeReasons'] = []
      if (level !== 'demonstrated' && level !== 'notStarted') {
        if (open.some((m) => m.concept === c || answers.some((a) => a.misconception === m.code && a.concept === c))) reasons.push('openMisconception')
        if (mine.slice(-5).filter((a) => a.outcome !== 'correct').length >= 2) reasons.push('repeatedMisses')
        if (lastCompletion && lastCompletion.result !== 'understood') reasons.push(lastCompletion.result === 'developing' ? 'lessonDeveloping' : 'lessonNeedsReview')
        if (latestAssessment?.conceptLevels[c] === 'gap' && !(lastCompletion && ev.indexOf(lastCompletion) > ev.indexOf(latestAssessment))) reasons.push('assessmentGap')
        if (last && last.outcome !== 'correct') reasons.push('lastAnswerMissed')
      }
      return [
        c,
        {
          concept: c,
          level,
          attempts: mine.length,
          correct: mine.filter((a) => a.outcome === 'correct').length,
          misses: mine.filter((a) => a.outcome !== 'correct').length,
          needsPractice: reasons.length > 0,
          needsPracticeReasons: reasons,
          lastAt: last?.at ?? null,
        },
      ]
    }),
  ) as Record<Concept, ConceptProgress>

  // Challenges and sessions
  const challenges = challengeViews(ev)
  const sessionCount = ev.filter((e) => e.type === 'session_started').length
  const active = [...challenges].reverse().find((c) => c.status === 'assigned') ?? null

  // Recommendation: rules over the derived levels, unless a coach override is still pending.
  const levelForRules = (c: Concept): ConceptLevel => {
    const cp = concepts[c]
    if (open.some((m) => m.concept === c)) return 'gap'
    if (cp.level === 'notStarted') return latestAssessment?.conceptLevels[c] ?? 'not_assessed'
    const lessonDone = LESSON_CATALOG.some((l) => l.concept === c && lessons[l.id].completions > 0)
    if (cp.needsPractice && !lessonDone) return 'unsure'
    if (cp.level === 'demonstrated') return 'consistent'
    return 'emerging'
  }
  const levels = Object.fromEntries(CONCEPTS.map((c) => [c, levelForRules(c)])) as Record<Concept, ConceptLevel>
  const rules = recommend(
    levels,
    open.map((m) => m.code),
    {
      completedLessons: LESSON_CATALOG.filter((l) => lessons[l.id].completions > 0).map((l) => l.id),
      // Assessment answers let the rules tell a foundational misconception from an applied (intermediate) gap,
      // so Today, Coach View and the diagnostic result recommend the same lesson.
      answers: answers
        .filter((a) => a.source === 'assessment' && ITEMS_BY_ID[a.itemKey])
        .map((a) => ({ itemId: a.itemKey, concept: a.concept, outcome: a.outcome === 'misconception' ? { kind: 'misconception', code: a.misconception! } : { kind: a.outcome === 'correct' ? 'correct' : 'unsure' } }) as unknown as ScoredAnswer),
    },
  )
  const overrides = ev.filter((e): e is Ev<'coach_override'> => e.type === 'coach_override')
  const lastOverride = overrides.at(-1)
  const overrideActive =
    !!lastOverride?.toLessonId && !completions.some((c) => c.lessonId === lastOverride.toLessonId && ev.indexOf(c) > ev.indexOf(lastOverride))
  const recommendation: ProgressView['recommendation'] = overrideActive
    ? {
        lessonId: lastOverride!.toLessonId!,
        source: 'coach',
        reason: lastOverride!.reason,
        override: { at: lastOverride!.at, fromLessonId: lastOverride!.fromLessonId, reason: lastOverride!.reason, ...(lastOverride!.note ? { note: lastOverride!.note } : {}) },
        rulesLessonId: rules.lessonId,
        rulesReason: rules.reason,
        alsoReview: rules.alsoReview,
      }
    : { lessonId: rules.lessonId, source: 'rules', reason: rules.reason, override: null, rulesLessonId: rules.lessonId, rulesReason: rules.reason, alsoReview: rules.alsoReview }

  const bySource: Record<AnswerSource, number> = { assessment: 0, lesson: 0, practice: 0 }
  for (const a of answers) bySource[a.source]++

  return {
    concepts,
    lessons,
    misconceptions,
    assessment: { attempts: assessments.length, latest: latestAssessment },
    practice: { total: answers.length, correct: answers.filter((a) => a.outcome === 'correct').length, bySource },
    challenges,
    activeChallenge: active,
    checkInDue: !!active && active.session < sessionCount,
    sessions: { count: sessionCount, lastAt: [...ev].reverse().find((e) => e.type === 'session_started')?.at ?? null },
    lastActivityAt: ev.at(-1)?.at ?? null,
    recommendation,
    coachLog: ev.filter((e): e is Ev<'coach_override' | 'coach_reviewed_lesson'> => e.type === 'coach_override' || e.type === 'coach_reviewed_lesson'),
  }
}

export { conceptOfLesson }

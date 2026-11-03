// Typed learner-progress schema (v1).
//
// A learner profile is a small identity record plus an append-only event log. Everything shown on the
// learner's progress screen and in the Coach View is DERIVED from that log by pure functions (./engine.ts),
// so the same events give the same picture in every language and on every device.
//
// What is never stored: real names, phone numbers, addresses, banking details, income, or business
// transaction records. Learners are identified by a fictional ID and a fictional demo alias.
import type { Lang } from '../i18n/strings'
import type { Business } from '../lib/calc'
import type { Concept, ConceptLevel, LessonId, MisconceptionCode, RecommendationReason } from '../assessment/types'
import type { LessonResult, StepId } from '../learning/types'

export const PROGRESS_SCHEMA_VERSION = 1 as const

/** Learner-facing understanding levels. Never "mastered": demonstrated means "showed it more than once". */
export const LEVELS = ['notStarted', 'introduced', 'practicing', 'demonstrated'] as const
export type UnderstandingLevel = (typeof LEVELS)[number]

/** 'incorrect' = wrong, but not a recognised misconception (e.g. an arithmetic slip): counted as a miss, no misconception code. */
export type AnswerOutcome = 'correct' | 'misconception' | 'incorrect' | 'unsure'
export type AnswerSource = 'assessment' | 'lesson' | 'practice'

/** Learner's own report on last week's activity. */
export const CHECKIN_STATUSES = ['done', 'partly', 'notYet'] as const
export type CheckInStatus = (typeof CHECKIN_STATUSES)[number]

/** What made the activity hard. Chosen by tapping pictures/words, so no free text is needed. */
export const DIFFICULTIES = ['noTime', 'forgot', 'hardToCount', 'notClear', 'shopClosed', 'other'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Why a coach changed the proposed next lesson. A reason code is always required. */
export const OVERRIDE_REASONS = ['needsReview', 'learnerRequest', 'alreadyKnows', 'businessFit', 'shortOnTime', 'other'] as const
export type OverrideReason = (typeof OVERRIDE_REASONS)[number]

/** Content level used for coaching and practice (the diagnostic tier, or the coach's choice). */
export const COACH_LEVELS = ['foundational', 'intermediate'] as const
export type CoachLevel = (typeof COACH_LEVELS)[number]
/** Why a coach changed the learning level. A reason code is always required. */
export const LEVEL_REASONS = ['showedUnderstanding', 'needsBasics', 'learnerRequest', 'other'] as const
export type LevelReason = (typeof LEVEL_REASONS)[number]

/** Structured coach-note categories (tap, no typing needed). */
export const NOTE_CATEGORIES = ['understood', 'needsPractice', 'languageDifficulty', 'appDifficulty', 'challengeNotDone', 'other'] as const
export type NoteCategory = (typeof NOTE_CATEGORIES)[number]

/** Coach's check of whether a learner who reported an activity can explain it ("done" is not "understood"). */
export const VERIFY_RESULTS = ['explained', 'partly', 'notYet'] as const
export type VerifyResult = (typeof VERIFY_RESULTS)[number]

/** The five steps of a guided coaching session. */
export const SESSION_STEPS = ['checkin', 'review', 'teach', 'practice', 'action'] as const
export type SessionStep = (typeof SESSION_STEPS)[number]

// ── Events (append-only) ─────────────────────────────────────────────

interface Base {
  at: string
}
export type ProgressEvent = Base &
  (
    | { type: 'session_started'; by: 'coach' | 'learner' }
    | { type: 'language_changed'; from: Lang; to: Lang }
    | { type: 'business_changed'; from: Business; to: Business }
    | {
        type: 'assessment_completed'
        attempt: number
        conceptLevels: Record<Concept, ConceptLevel>
        misconceptions: MisconceptionCode[]
        recommendedLessonId: LessonId
        /** Diagnostic tier (added 2026-11-01; absent on older events). */
        tier?: 'foundational' | 'intermediate'
        mainMisconceptions?: MisconceptionCode[]
      }
    | { type: 'lesson_started'; lessonId: LessonId }
    | {
        type: 'answer'
        source: AnswerSource
        concept: Concept
        /** Stable id of the question (e.g. "lesson:revenue_vs_profit:practice", an assessment item id). */
        itemKey: string
        outcome: AnswerOutcome
        misconception?: MisconceptionCode
        lessonId?: LessonId
        /** First answer to this question in this run. Only first tries count as independent evidence of understanding. */
        firstTry: boolean
      }
    | { type: 'lesson_completed'; lessonId: LessonId; result: LessonResult }
    | { type: 'challenge_assigned'; recordId: string; challengeId: string; lessonId: LessonId; concept: Concept; followUpOf?: string }
    | { type: 'challenge_declined'; challengeId: string; lessonId: LessonId }
    | { type: 'challenge_checkin'; recordId: string; status: CheckInStatus; difficulties: Difficulty[]; note?: string; offeredFollowUpId: string | null; by?: 'coach' | 'learner' }
    | { type: 'coach_override'; fromLessonId: LessonId; toLessonId: LessonId | null; reason: OverrideReason; note?: string; ruleId?: string }
    | { type: 'coach_reviewed_lesson'; lessonId: LessonId }
    // ── Coaching assistant (added 2026-11-01) ──
    /** Coach accepted the app's recommendation as it stands (a snapshot of what was accepted). */
    | { type: 'coach_accepted'; lessonId: LessonId; level: CoachLevel; ruleId: string }
    /** Coach set the content level (null = go back to the level from the diagnostic). Never deletes evidence. */
    | { type: 'coach_level_set'; level: CoachLevel | null; fromLevel: CoachLevel | null; reason: LevelReason; note?: string }
    | { type: 'challenge_verified'; recordId: string; result: VerifyResult }
    | { type: 'coach_note'; categories: NoteCategory[]; text?: string; sessionId?: string }
    | { type: 'coach_session_started'; sessionId: string; lessonId: LessonId; level: CoachLevel; ruleId: string }
    | { type: 'coach_session_step'; sessionId: string; step: SessionStep }
    | { type: 'coach_session_paused'; sessionId: string; step: SessionStep }
    | { type: 'coach_session_completed'; sessionId: string }
  )
export type ProgressEventType = ProgressEvent['type']

export interface LearnerProfile {
  schemaVersion: typeof PROGRESS_SCHEMA_VERSION
  /** Fictional ID, e.g. "DL-01". Never a phone number or government ID. */
  learnerId: string
  /** Fictional display alias for the demo, per script. A real deployment would let the learner pick a nickname with consent. */
  alias: Record<Lang, string>
  isDemo: boolean
  language: Lang
  business: Business
  onboarded: boolean
  createdAt: string
  events: ProgressEvent[]
}

// ── Derived view (never stored) ──────────────────────────────────────

export interface ConceptProgress {
  concept: Concept
  level: UnderstandingLevel
  /** Answers given on this concept (assessment + lessons + practice). */
  attempts: number
  correct: number
  misses: number
  needsPractice: boolean
  /** Why it needs practice, for the coach. */
  needsPracticeReasons: ('openMisconception' | 'repeatedMisses' | 'lessonNeedsReview' | 'lessonDeveloping' | 'assessmentGap' | 'lastAnswerMissed')[]
  lastAt: string | null
}

export interface LessonProgress {
  lessonId: LessonId
  status: 'notStarted' | 'inProgress' | 'completed'
  /** Times the lesson was started (first time + restarts). */
  starts: number
  completions: number
  lastResult: LessonResult | null
  lastCompletedAt: string | null
  /** Saved step of an unfinished lesson (read from the lesson store), for "resume". */
  resumeStep: StepId | null
}

export interface MisconceptionView {
  code: MisconceptionCode
  concept: Concept
  count: number
  firstSeenAt: string
  lastSeenAt: string
  resolved: boolean
}

export interface ChallengeView {
  recordId: string
  challengeId: string
  lessonId: LessonId
  concept: Concept
  assignedAt: string
  /** Session number in which it was assigned (check-in happens in a later session). */
  session: number
  followUpOf: string | null
  status: 'assigned' | CheckInStatus | 'replaced'
  checkIn: { at: string; difficulties: Difficulty[]; note?: string; offeredFollowUpId: string | null } | null
}

export interface Recommendation {
  lessonId: LessonId
  source: 'rules' | 'coach'
  /** Rules: why the engine chose it. Coach: the recorded reason. */
  reason: string
  override: { at: string; fromLessonId: LessonId; reason: OverrideReason; note?: string } | null
  /** What the rules alone would recommend (shown next to a coach override). */
  rulesLessonId: LessonId
  /** Which deterministic rule produced rulesLessonId (kept when a coach overrides, for "Why this lesson?"). */
  rulesReason: RecommendationReason
  /** Other topics the rules found needing work, in learning-path order. */
  alsoReview: Concept[]
}

export interface ProgressView {
  concepts: Record<Concept, ConceptProgress>
  lessons: Record<LessonId, LessonProgress>
  misconceptions: MisconceptionView[]
  assessment: { attempts: number; latest: Extract<ProgressEvent, { type: 'assessment_completed' }> | null }
  practice: { total: number; correct: number; bySource: Record<AnswerSource, number> }
  challenges: ChallengeView[]
  activeChallenge: ChallengeView | null
  checkInDue: boolean
  sessions: { count: number; lastAt: string | null }
  lastActivityAt: string | null
  recommendation: Recommendation
  coachLog: Extract<ProgressEvent, { type: 'coach_override' | 'coach_reviewed_lesson' }>[]
}

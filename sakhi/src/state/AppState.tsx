// App-wide state. Learner data lives in the ProgressRepository (typed profiles + event log); this provider only
// keeps UI preferences (active learner, coach language, demo offline flag) and exposes derived views + actions.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translate, type Lang, type StringKey } from '../i18n/strings'
import type { Business } from '../lib/calc'
import { LANGUAGES } from '../speech/languages'
import { containsPersonalData } from '../../shared/aiGuards.mjs'
import { defaultStore, type KeyValueStore } from '../assessment/storage'
import { LESSON_CATALOG } from '../assessment/bank'
import type { AssessmentResult, Concept, LessonId, MisconceptionCode } from '../assessment/types'
import { loadLesson } from '../learning/storage'
import type { LessonContent, LessonState } from '../learning/types'
import { LocalProgressRepository, type ProgressRepository } from '../progress/repository'
import { DEFAULT_LEARNER_ID, buildDemoLearners, resetDemo as resetDemoData } from '../progress/demo'
import {
  assignChallenge,
  checkInChallenge,
  coachOverride,
  coachReviewedLesson,
  declineChallenge,
  deriveProgress,
  ensureSession,
  markOnboarded,
  recordAssessment as recordAssessmentEvent,
  recordPracticeAnswer,
  setBusiness as setBusinessEvent,
  setLanguage as setLanguageEvent,
  startSession as startSessionEvent,
} from '../progress/engine'
import { applyLessonTransition } from '../progress/lessonBridge'
import { mainChallengeFor, type FollowUpPlan } from '../progress/challenges'
import type {
  AnswerOutcome,
  ChallengeView,
  CheckInStatus,
  CoachLevel,
  Difficulty,
  LearnerProfile,
  LevelReason,
  NoteCategory,
  OverrideReason,
  ProgressView,
  SessionStep,
  UnderstandingLevel,
  VerifyResult,
} from '../progress/types'
import * as coaching from '../coaching/model'
import type { CoachSummary } from '../coaching/model'

/** Kept as the UI name for understanding levels. */
export type Mastery = UnderstandingLevel
export type ModuleId = 'm1' | 'm2' | 'm3' | 'm4' | 'm5'
export const MODULES: ModuleId[] = ['m1', 'm2', 'm3', 'm4', 'm5']

export const moduleOfLesson = (lessonId: LessonId): ModuleId => LESSON_CATALOG.find((l) => l.id === lessonId)!.moduleId
export const lessonOfModule = (m: ModuleId): LessonId => LESSON_CATALOG.find((l) => l.moduleId === m)!.id
export const conceptOfModule = (m: ModuleId): Concept => LESSON_CATALOG.find((l) => l.moduleId === m)!.concept

interface Prefs {
  activeLearnerId: string
  coachLang: Lang
  offline: boolean
}
const PREFS_KEY = 'hisaab.ui.v1'
const DEFAULT_PREFS: Prefs = { activeLearnerId: DEFAULT_LEARNER_ID, coachLang: 'en', offline: false }

function loadPrefs(store: KeyValueStore): Prefs {
  try {
    const raw = store.getItem(PREFS_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) }
  } catch {
    /* defaults */
  }
  return DEFAULT_PREFS
}

type T = (key: StringKey | (string & {}), vars?: Record<string, string | number>) => string

interface Ctx {
  // Active learner (learner-facing screens)
  learnerId: string
  profile: LearnerProfile
  progress: ProgressView
  lang: Lang
  business: Business
  onboarded: boolean
  name: string
  t: T
  /** Understanding level per module (derived from the concept the module teaches). */
  mastery: Record<ModuleId, Mastery>
  completed: ModuleId[]
  /** Next lesson to do (coach override, else rules). */
  currentModule: ModuleId
  recommendedModule: ModuleId
  /** The activity to show: the active one, else the most recent. */
  challenge: ChallengeView | null
  store: KeyValueStore

  setLang: (l: Lang) => void
  setBusiness: (b: Business) => void
  recordAssessment: (r: AssessmentResult) => void
  recordLessonTransition: (content: LessonContent, prev: LessonState, next: LessonState) => void
  assignLessonChallenge: (lessonId: LessonId) => void
  declineLessonChallenge: (lessonId: LessonId) => void
  checkIn: (recordId: string, status: CheckInStatus, difficulties: Difficulty[], note?: string) => FollowUpPlan
  acceptFollowUp: (challengeId: string, followUpOf: string) => void
  recordPractice: (a: { concept: Concept; itemKey: string; outcome: AnswerOutcome; misconception?: MisconceptionCode; firstTry: boolean }) => void

  // UI
  offline: boolean
  setOffline: (o: boolean) => void

  // Coach View
  coachLang: Lang
  setCoachLang: (l: Lang) => void
  tc: T
  learners: LearnerProfile[]
  progressOf: (learnerId: string) => ProgressView | null
  startSession: (learnerId: string) => void
  overrideNextLesson: (learnerId: string, toLessonId: LessonId | null, reason: OverrideReason, note?: string) => void
  markLessonReviewed: (learnerId: string, lessonId: LessonId) => void
  resetDemo: () => void
  repo: ProgressRepository

  // Coaching assistant (src/coaching). Every action appends events to that learner's own record only.
  /** Clock used by the Coach View (injectable in tests). */
  now: () => string
  coachSummaryOf: (learnerId: string) => CoachSummary | null
  /** Content level used for the ACTIVE learner's practice (coach's choice, else the diagnostic tier). */
  learnerLevel: CoachLevel
  acceptRecommendation: (learnerId: string) => void
  changeRecommendation: (learnerId: string, o: { toLessonId: LessonId; reason: OverrideReason; note?: string }) => void
  setLevel: (learnerId: string, level: CoachLevel | null, reason: LevelReason, note?: string) => void
  coachCheckIn: (learnerId: string, recordId: string, status: CheckInStatus, difficulties: Difficulty[]) => FollowUpPlan
  verifyChallenge: (learnerId: string, recordId: string, result: VerifyResult) => void
  agreeChallenge: (learnerId: string, challengeId: string, followUpOf?: string) => void
  addNote: (learnerId: string, o: { categories: NoteCategory[]; text?: string; sessionId?: string }) => void
  startCoachSession: (learnerId: string) => string
  setSessionStep: (learnerId: string, sessionId: string, step: SessionStep) => void
  pauseSession: (learnerId: string, sessionId: string) => void
  completeSession: (learnerId: string, sessionId: string) => void
  recordSessionPractice: (learnerId: string, sessionId: string, a: { concept: Concept; question: string; outcome: AnswerOutcome; misconception?: MisconceptionCode }) => void
  /** Hands the phone to the learner: makes her the active learner (the caller then navigates). */
  openLearnerApp: (learnerId: string) => void
}

const AppCtx = createContext<Ctx | null>(null)

/** Seeds the fictional demo learners the first time the prototype runs on a device. */
function ensureSeeded(repo: ProgressRepository, store: KeyValueStore, now: string) {
  if (repo.list().length) return
  for (const p of buildDemoLearners(store, now)) repo.save(p)
}

export function AppStateProvider({ children, store: injected, clock }: { children: ReactNode; store?: KeyValueStore; clock?: () => string }) {
  const store = useMemo(() => injected ?? defaultStore(), [injected])
  const now = useCallback(() => (clock ? clock() : new Date().toISOString()), [clock])
  const repo = useMemo(() => {
    const r = new LocalProgressRepository(store)
    ensureSeeded(r, store, clock ? clock() : new Date().toISOString())
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs(store))

  // Re-render on every repository change.
  const [rev, setRev] = useState(0)
  useEffect(() => repo.subscribe(() => setRev((x) => x + 1)), [repo])

  useEffect(() => {
    try {
      store.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore */
    }
  }, [prefs, store])

  const learners = useMemo(() => repo.list(), [repo, rev]) // eslint-disable-line react-hooks/exhaustive-deps
  const profile = learners.find((l) => l.learnerId === prefs.activeLearnerId) ?? learners.find((l) => l.learnerId === DEFAULT_LEARNER_ID) ?? learners[0]

  /** Applies a pure update to one learner and saves it. */
  const update = useCallback(
    (learnerId: string, fn: (p: LearnerProfile) => LearnerProfile) => {
      const p = repo.get(learnerId)
      if (!p) return
      const next = fn(p)
      if (next !== p) repo.save(next)
    },
    [repo],
  )

  // A learner session starts when the app is opened for a learner (or after a long gap).
  useEffect(() => {
    if (profile) update(profile.learnerId, (p) => ensureSession(p, now()))
  }, [profile?.learnerId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile) document.documentElement.lang = LANGUAGES[profile.language].bcp47
  }, [profile?.language]) // eslint-disable-line react-hooks/exhaustive-deps

  const resumeFor = useCallback((learnerId: string) => (lessonId: LessonId) => loadLesson(store, learnerId, lessonId)?.step ?? null, [store])
  const progress = useMemo(() => deriveProgress(profile, { resumeStep: resumeFor(profile.learnerId) }), [profile, resumeFor])

  const value = useMemo<Ctx>(() => {
    const lang = profile.language
    const t: T = (key, vars) => translate(lang, key as StringKey, vars)
    const id = profile.learnerId
    const mastery = Object.fromEntries(MODULES.map((m) => [m, progress.concepts[conceptOfModule(m)].level])) as Record<ModuleId, Mastery>
    const completed = MODULES.filter((m) => progress.lessons[lessonOfModule(m)].completions > 0)
    const recommendedModule = moduleOfLesson(progress.recommendation.lessonId)
    const challenge = progress.activeChallenge ?? progress.challenges.at(-1) ?? null

    return {
      learnerId: id,
      profile,
      progress,
      lang,
      business: profile.business,
      onboarded: profile.onboarded,
      name: profile.alias[lang],
      t,
      mastery,
      completed,
      currentModule: recommendedModule,
      recommendedModule,
      challenge,
      store,

      setLang: (l) => update(id, (p) => setLanguageEvent(p, l, now())),
      setBusiness: (b) => update(id, (p) => setBusinessEvent(p, b, now())),
      recordAssessment: (r) => update(id, (p) => markOnboarded(recordAssessmentEvent(p, r, now()))),
      recordLessonTransition: (content, prev, next) => update(id, (p) => applyLessonTransition(p, content, prev, next, now())),
      assignLessonChallenge: (lessonId) => {
        const spec = mainChallengeFor(lessonId)
        if (spec) update(id, (p) => assignChallenge(p, spec.id, now()))
      },
      declineLessonChallenge: (lessonId) => {
        const spec = mainChallengeFor(lessonId)
        if (spec) update(id, (p) => declineChallenge(p, spec.id, now()))
      },
      checkIn: (recordId, status, difficulties, note) => {
        const p = repo.get(id)!
        const r = checkInChallenge(p, recordId, status, difficulties, note, now(), containsPersonalData)
        repo.save(r.profile)
        return r.plan
      },
      acceptFollowUp: (challengeId, followUpOf) => update(id, (p) => assignChallenge(p, challengeId, now(), followUpOf)),
      recordPractice: (a) => update(id, (p) => recordPracticeAnswer(p, a, now())),

      offline: prefs.offline,
      setOffline: (offline) => setPrefs((x) => ({ ...x, offline })),

      coachLang: prefs.coachLang,
      setCoachLang: (coachLang) => setPrefs((x) => ({ ...x, coachLang })),
      tc: (key, vars) => translate(prefs.coachLang, key as StringKey, vars),
      learners,
      progressOf: (learnerId) => {
        const p = learners.find((l) => l.learnerId === learnerId)
        return p ? deriveProgress(p, { resumeStep: resumeFor(learnerId) }) : null
      },
      startSession: (learnerId) => {
        update(learnerId, (p) => markOnboarded(startSessionEvent(p, 'coach', now())))
        setPrefs((x) => ({ ...x, activeLearnerId: learnerId }))
      },
      overrideNextLesson: (learnerId, toLessonId, reason, note) =>
        update(learnerId, (p) => {
          const from = deriveProgress(p).recommendation.lessonId
          return coachOverride(p, { fromLessonId: from, toLessonId, reason, note }, now(), containsPersonalData)
        }),
      markLessonReviewed: (learnerId, lessonId) => update(learnerId, (p) => coachReviewedLesson(p, lessonId, now())),

      now,
      coachSummaryOf: (learnerId) => {
        const p = learners.find((l) => l.learnerId === learnerId)
        return p ? coaching.coachSummary(p, deriveProgress(p, { resumeStep: resumeFor(learnerId) }), now()) : null
      },
      learnerLevel: coaching.learningLevel(profile, progress).value,
      acceptRecommendation: (learnerId) =>
        update(learnerId, (p) => {
          const v = deriveProgress(p)
          return coaching.acceptRecommendation(p, coaching.buildRecommendation(p, v), now())
        }),
      changeRecommendation: (learnerId, o) =>
        update(learnerId, (p) => {
          const v = deriveProgress(p)
          const r = coaching.buildRecommendation(p, v)
          return coachOverride(p, { fromLessonId: v.recommendation.lessonId, toLessonId: o.toLessonId, reason: o.reason, note: o.note, ruleId: r.rules.ruleId }, now(), containsPersonalData)
        }),
      setLevel: (learnerId, level, reason, note) =>
        update(learnerId, (p) => coaching.setCoachLevel(p, { level, reason, note }, coaching.learningLevel(p, deriveProgress(p)).value, now(), containsPersonalData)),
      coachCheckIn: (learnerId, recordId, status, difficulties) => {
        const p = repo.get(learnerId)!
        const r = checkInChallenge(p, recordId, status, difficulties, undefined, now(), containsPersonalData, 'coach')
        repo.save(r.profile)
        return r.plan
      },
      verifyChallenge: (learnerId, recordId, result) => update(learnerId, (p) => coaching.verifyChallenge(p, recordId, result, deriveProgress(p), now())),
      agreeChallenge: (learnerId, challengeId, followUpOf) => update(learnerId, (p) => assignChallenge(p, challengeId, now(), followUpOf)),
      addNote: (learnerId, o) => update(learnerId, (p) => coaching.addCoachNote(p, o, now(), containsPersonalData)),
      startCoachSession: (learnerId) => {
        const p = repo.get(learnerId)!
        const r = coaching.startCoachSession(p, coaching.buildRecommendation(p, deriveProgress(p)), now())
        if (r.profile !== p) repo.save(r.profile)
        return r.sessionId
      },
      setSessionStep: (learnerId, sessionId, step) => update(learnerId, (p) => coaching.setSessionStep(p, sessionId, step, now())),
      pauseSession: (learnerId, sessionId) => update(learnerId, (p) => coaching.pauseSession(p, sessionId, now())),
      completeSession: (learnerId, sessionId) => update(learnerId, (p) => coaching.completeSession(p, sessionId, now())),
      recordSessionPractice: (learnerId, sessionId, a) => update(learnerId, (p) => coaching.recordSessionPractice(p, sessionId, a, now())),
      openLearnerApp: (learnerId) => setPrefs((x) => ({ ...x, activeLearnerId: learnerId })),
      resetDemo: () => {
        resetDemoData(store, now())
        setPrefs({ ...DEFAULT_PREFS, coachLang: prefs.coachLang })
        ;(repo as LocalProgressRepository).emit()
      },
      repo,
    }
  }, [profile, progress, prefs, learners, update, repo, store, now, resumeFor])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp outside provider')
  return c
}

// Data-access abstraction for learner progress.
//
// The UI only talks to `ProgressRepository`. The class prototype uses `LocalProgressRepository` (localStorage
// through the KeyValueStore interface). A future backend adapter implements the same interface on top of a
// local cache plus background sync of the append-only event log (see docs/PROGRESS.md), so reads stay
// synchronous and the app keeps working offline.
import { storeKeys, type KeyValueStore } from '../assessment/storage'
import { PROGRESS_SCHEMA_VERSION, type LearnerProfile, type ProgressEvent } from './types'

export interface ProgressRepository {
  list(): LearnerProfile[]
  get(learnerId: string): LearnerProfile | null
  save(profile: LearnerProfile): void
  remove(learnerId: string): void
  /** Called after every save/remove (also from other tabs for localStorage). */
  subscribe(listener: () => void): () => void
}

export const PROGRESS_PREFIX = 'hisaab.progress.v1.'
const INDEX = `${PROGRESS_PREFIX}index`
const keyFor = (id: string) => `${PROGRESS_PREFIX}learner.${id}`

const EVENT_TYPES: ProgressEvent['type'][] = [
  'session_started',
  'language_changed',
  'business_changed',
  'assessment_completed',
  'lesson_started',
  'answer',
  'lesson_completed',
  'challenge_assigned',
  'challenge_declined',
  'challenge_checkin',
  'coach_override',
  'coach_reviewed_lesson',
  'coach_accepted',
  'coach_level_set',
  'challenge_verified',
  'coach_note',
  'coach_session_started',
  'coach_session_step',
  'coach_session_paused',
  'coach_session_completed',
]

/** Runtime check of stored data (it may be stale, edited, or from an older build). Invalid records are ignored. */
export function isLearnerProfile(x: unknown): x is LearnerProfile {
  const p = x as LearnerProfile
  return (
    !!p &&
    p.schemaVersion === PROGRESS_SCHEMA_VERSION &&
    typeof p.learnerId === 'string' &&
    /^[A-Z]{2}-\d{2,4}$/.test(p.learnerId) &&
    ['en', 'hi', 'te'].includes(p.language) &&
    ['vegetable', 'tea', 'grocery'].includes(p.business) &&
    !!p.alias &&
    typeof p.alias.en === 'string' &&
    Array.isArray(p.events) &&
    p.events.every((e) => !!e && typeof e.at === 'string' && EVENT_TYPES.includes(e.type))
  )
}

export class LocalProgressRepository implements ProgressRepository {
  private listeners = new Set<() => void>()
  private store: KeyValueStore
  constructor(store: KeyValueStore) {
    this.store = store
  }

  private index(): string[] {
    try {
      const ids = JSON.parse(this.store.getItem(INDEX) ?? '[]')
      return Array.isArray(ids) ? ids.filter((i) => typeof i === 'string') : []
    } catch {
      return []
    }
  }

  list(): LearnerProfile[] {
    return this.index()
      .map((id) => this.get(id))
      .filter((p): p is LearnerProfile => !!p)
  }

  get(id: string): LearnerProfile | null {
    try {
      const raw = this.store.getItem(keyFor(id))
      const p = raw ? JSON.parse(raw) : null
      return isLearnerProfile(p) && p.learnerId === id ? p : null
    } catch {
      return null
    }
  }

  save(p: LearnerProfile): void {
    if (!isLearnerProfile(p)) throw new Error('Refusing to save an invalid learner profile')
    try {
      this.store.setItem(keyFor(p.learnerId), JSON.stringify(p))
      const ids = this.index()
      if (!ids.includes(p.learnerId)) this.store.setItem(INDEX, JSON.stringify([...ids, p.learnerId]))
    } catch {
      /* storage full or unavailable: the session continues in memory */
    }
    this.emit()
  }

  remove(id: string): void {
    this.store.removeItem(keyFor(id))
    this.store.setItem(INDEX, JSON.stringify(this.index().filter((x) => x !== id)))
    this.emit()
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  emit() {
    for (const fn of this.listeners) fn()
  }
}

/** Every key this prototype writes starts with one of these. Used by "reset demo". */
export const APP_KEY_PREFIXES = ['hisaab.', 'hisaab-saathi-']

export function clearAppData(store: KeyValueStore): number {
  const keys = storeKeys(store).filter((k) => APP_KEY_PREFIXES.some((p) => k.startsWith(p)))
  for (const k of keys) store.removeItem(k)
  return keys.length
}

// Local persistence for assessment sessions and results (offline-first, on-device only).
// Stores option ids and classifications, never free text answers or financial data about the learner.

import type { AssessmentResult, AssessmentSession } from './types'
import { ITEMS_BY_ID } from './bank'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** Optional enumeration (MemoryStore); localStorage is enumerated via length/key(). */
  keys?(): string[]
}

/** All keys in a store (used by demo reset). */
export function storeKeys(store: KeyValueStore): string[] {
  if (store.keys) return store.keys()
  const ls = store as unknown as Storage
  if (typeof ls.length === 'number' && typeof ls.key === 'function') return Array.from({ length: ls.length }, (_, i) => ls.key(i)!).filter(Boolean)
  return []
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  keys() {
    return [...this.m.keys()]
  }
}

/** Uses localStorage when available, otherwise an in-memory store (private mode, tests, previews). */
export function defaultStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage
    const probe = '__hs_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return ls
  } catch {
    return new MemoryStore()
  }
}

export interface LearnerAssessmentRecord {
  schemaVersion: 1
  inProgress: AssessmentSession | null
  results: AssessmentResult[]
}

const EMPTY: LearnerAssessmentRecord = { schemaVersion: 1, inProgress: null, results: [] }
export const storageKey = (learnerId: string) => `hisaab.assessment.v1.${learnerId}`

function validSession(s: unknown): s is AssessmentSession {
  const x = s as AssessmentSession
  return (
    !!x &&
    x.schemaVersion === 1 &&
    typeof x.id === 'string' &&
    Array.isArray(x.itemIds) &&
    x.itemIds.every((id) => typeof id === 'string' && id in ITEMS_BY_ID) &&
    Array.isArray(x.answers) &&
    x.answers.length <= x.itemIds.length &&
    x.answers.every((a, i) => a.itemId === x.itemIds[i])
  )
}

export function loadRecord(store: KeyValueStore, learnerId: string): LearnerAssessmentRecord {
  try {
    const raw = store.getItem(storageKey(learnerId))
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as LearnerAssessmentRecord
    if (parsed?.schemaVersion !== 1) return { ...EMPTY }
    return {
      schemaVersion: 1,
      inProgress: validSession(parsed.inProgress) ? parsed.inProgress : null,
      results: Array.isArray(parsed.results) ? parsed.results.filter((r) => r?.schemaVersion === 1) : [],
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveRecord(store: KeyValueStore, learnerId: string, rec: LearnerAssessmentRecord): void {
  try {
    store.setItem(storageKey(learnerId), JSON.stringify(rec))
  } catch {
    /* storage full or unavailable: the session continues in memory */
  }
}

export function latestResult(rec: LearnerAssessmentRecord): AssessmentResult | null {
  return rec.results.length ? rec.results[rec.results.length - 1] : null
}

export function nextAttemptNumber(rec: LearnerAssessmentRecord): number {
  return rec.results.reduce((m, r) => Math.max(m, r.attempt), 0) + 1
}

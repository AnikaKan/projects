// On-device persistence of lesson progress (one record per learner per lesson).
import type { KeyValueStore } from '../assessment/storage'
import { STEPS, type LessonState } from './types'
import { REVENUE_VS_PROFIT } from './content/revenueVsProfit'
import type { LessonContent } from './types'

/** Lessons with full content. Other modules fall back to a placeholder screen. */
export const LESSONS: Partial<Record<string, LessonContent>> = { revenue_vs_profit: REVENUE_VS_PROFIT }

export const lessonKey = (learnerId: string, lessonId: string) => `hisaab.lesson.v1.${learnerId}.${lessonId}`

function valid(s: unknown): s is LessonState {
  const x = s as LessonState
  return (
    !!x &&
    x.schemaVersion === 1 &&
    typeof x.lessonId === 'string' &&
    (STEPS as readonly string[]).includes(x.step) &&
    !!x.questions?.response &&
    !!x.questions?.practice &&
    !!x.questions?.check &&
    ['vegetable', 'tea', 'grocery'].includes(x.business)
  )
}

export function loadLesson(store: KeyValueStore, learnerId: string, lessonId: string): LessonState | null {
  try {
    const raw = store.getItem(lessonKey(learnerId, lessonId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return valid(parsed) && parsed.lessonId === lessonId ? parsed : null
  } catch {
    return null
  }
}

export function saveLesson(store: KeyValueStore, learnerId: string, state: LessonState): void {
  try {
    store.setItem(lessonKey(learnerId, state.lessonId), JSON.stringify(state))
  } catch {
    /* storage unavailable: lesson continues in memory */
  }
}

export function clearLesson(store: KeyValueStore, learnerId: string, lessonId: string): void {
  try {
    store.removeItem(lessonKey(learnerId, lessonId))
  } catch {
    /* ignore */
  }
}

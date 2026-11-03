// Reviewed translation overrides (from native-speaker review), applied on top of the source dictionaries.
// Edit via: npm run i18n:export → review translations/review.csv → npm run i18n:import translations/review.csv
// See docs/SPEECH.md §6. Amounts never appear in translations; they are filled in from code.
import data from './translation-overrides.json'
import type { Lang } from './strings'

export type OverrideNamespace = 'ui' | 'assessment' | `lesson.${string}`
type OverrideMap = Partial<Record<string, Partial<Record<Lang, Record<string, string>>>>>

let current: OverrideMap = data as OverrideMap

export function override(ns: OverrideNamespace, lang: Lang, key: string): string | undefined {
  return current[ns]?.[lang]?.[key]
}

/** Test hook: replace the active overrides. Returns a restore function. */
export function setOverridesForTest(map: OverrideMap): () => void {
  const prev = current
  current = map
  return () => {
    current = prev
  }
}

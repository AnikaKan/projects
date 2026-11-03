// Translation review workflow helpers (pure; used by scripts/i18n.ts and tests).
// Native speakers edit a CSV; validated changes become translation-overrides.json — no code edits needed.

import { DICTS, type Lang } from './strings'
import { A_DICTS } from '../assessment/i18n'
import { LESSONS } from '../learning/storage'

export interface ReviewRow {
  namespace: string
  key: string
  en: string
  hi: string
  te: string
}

/** Every reviewable string with its current source text. */
export function collectEntries(): ReviewRow[] {
  const rows: ReviewRow[] = []
  for (const key of Object.keys(DICTS.en)) {
    const k = key as keyof typeof DICTS.en
    rows.push({ namespace: 'ui', key, en: DICTS.en[k], hi: DICTS.hi[k], te: DICTS.te[k] })
  }
  for (const key of Object.keys(A_DICTS.en)) {
    const k = key as keyof typeof A_DICTS.en
    rows.push({ namespace: 'assessment', key, en: A_DICTS.en[k], hi: A_DICTS.hi[k], te: A_DICTS.te[k] })
  }
  for (const content of Object.values(LESSONS)) {
    if (!content) continue
    const t = content.text
    for (const key of Object.keys(t.en.t)) rows.push({ namespace: `lesson.${content.id}`, key, en: t.en.t[key], hi: t.hi.t[key], te: t.te.t[key] })
  }
  return rows
}

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

export function toCsv(rows: ReviewRow[]): string {
  const head = 'namespace,key,en,hi,te'
  return '﻿' + [head, ...rows.map((r) => [r.namespace, r.key, r.en, r.hi, r.te].map(esc).join(','))].join('\n') + '\n'
}

export function parseCsv(text: string): ReviewRow[] {
  const src = text.replace(/^﻿/, '')
  const records: string[][] = []
  let field = ''
  let row: string[] = []
  let q = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      records.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field || row.length) {
    row.push(field)
    records.push(row)
  }
  const [header, ...body] = records.filter((r) => r.some((x) => x.trim()))
  const idx = (name: string) => header.indexOf(name)
  return body.map((r) => ({ namespace: r[idx('namespace')], key: r[idx('key')], en: r[idx('en')], hi: r[idx('hi')], te: r[idx('te')] }))
}

const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort().join(',')

export interface ImportResult {
  overrides: Record<string, Partial<Record<Lang, Record<string, string>>>>
  changed: number
  rejected: { namespace: string; key: string; lang: Lang; reason: string }[]
}

/**
 * Turns an edited CSV into overrides. A change is rejected when it would break the app:
 * different {slots} from English, a hard-coded amount, or an empty string.
 */
export function buildOverrides(edited: ReviewRow[], base: ReviewRow[] = collectEntries()): ImportResult {
  const byId = new Map(base.map((r) => [`${r.namespace}::${r.key}`, r]))
  const result: ImportResult = { overrides: {}, changed: 0, rejected: [] }
  for (const row of edited) {
    const src = byId.get(`${row.namespace}::${row.key}`)
    if (!src) continue
    for (const lang of ['hi', 'te'] as const) {
      const v = (row[lang] ?? '').trim()
      if (v === src[lang]) continue
      let reason = ''
      if (!v) reason = 'empty'
      else if (slots(v) !== slots(src.en)) reason = `slots must be {${slots(src.en)}}`
      else if (/₹|\d{2,}/.test(v)) reason = 'amounts must not be typed in translations'
      if (reason) {
        result.rejected.push({ namespace: row.namespace, key: row.key, lang, reason })
        continue
      }
      ;((result.overrides[row.namespace] ??= {})[lang] ??= {})[row.key] = v
      result.changed++
    }
  }
  return result
}

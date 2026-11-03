// Prepares on-screen text for Sarvam Bulbul TTS.
// Docs: native script works best (romanised Indic lowers quality); "Write numbers over four digits with
// commas (e.g., 10,000)"; no SSML — pacing is controlled by `pace` and by splitting at pause points.
import type { Lang } from '../i18n/strings'
import { LANGUAGES } from './languages'

/** Indian digit grouping: 1500 → 1,500; 150000 → 1,50,000. */
export function indianGrouping(n: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)
}

/**
 * ₹1,500 − ₹300 = ₹1,200  →  "1,500 रुपये, घटा 300 रुपये, बराबर 1,200 रुपये"
 * Commas around amounts and operators give the voice a short pause so numbers are not rushed.
 */
export function toSarvamSpeakable(text: string, lang: Lang): string {
  const w = LANGUAGES[lang].speech
  return text
    .replace(/₹\s?([\d,]+)/g, (_, n: string) => `${indianGrouping(Number(n.replace(/,/g, '')))} ${w.rupees}`)
    .replace(/\s[−-]\s/g, `, ${w.minus} `)
    .replace(/\s\+\s/g, `, ${w.plus} `)
    .replace(/\s=\s/g, `, ${w.equals} `)
    .replace(/[“”"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const SARVAM_MAX_CHARS = 2500

/** Pace values sent to Bulbul v3 (allowed range 0.5–2.0). */
export const SARVAM_PACE = { normal: 0.9, slow: 0.7 } as const

// Confidence-gated resolver for assessment questions (kept for the STT → optional AI mapper pipeline).
// The live UI uses speech/answerMatching.ts via components/speech/VoiceAnswer.tsx; both only pick an
// option id for the learner to confirm — scoring always happens in scoreAnswer().

import type { Lang } from '../i18n/strings'
import type { RenderedQuestion } from './types'
import { parseSpokenAmount } from '../speech/numbers'

export interface SpokenAnswer {
  transcript: string
  lang: Lang
  /** STT confidence 0..1 */
  confidence: number
}

export type VoiceResolution =
  | { status: 'match'; optionId: string; via: 'yes_no' | 'amount' | 'label' | 'unsure'; needsConfirmation: true }
  | { status: 'no_match' }

/** Optional future AI mapper. Must return an option id from the given list or null. */
export interface AnswerMapper {
  map(transcript: string, options: { id: string; label: string }[], lang: Lang): Promise<string | null>
}

export const MIN_STT_CONFIDENCE = 0.6

// Per-locale synonyms, including common romanised and code-mixed forms.
const YES = ['yes', 'yeah', 'haan', 'han', 'ha', 'ji haan', 'हाँ', 'हां', 'जी', 'जी हाँ', 'avunu', 'అవును', 'aunu', 'ఔను']
const NO = ['no', 'nahi', 'nahin', 'नहीं', 'नही', 'naa', 'ledu', 'లేదు', 'kaadu', 'కాదు']
const UNSURE = ['not sure', "don't know", 'dont know', 'pata nahi', 'पता नहीं', 'मालूम नहीं', 'teliyadu', 'తెలియదు', 'తెలీదు']

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?।'"“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const hasPhrase = (text: string, phrases: string[]) => phrases.some((p) => ` ${text} `.includes(` ${norm(p)} `))

/** Extracts the first whole-rupee amount written with digits ("₹1,200", "1200 rupees"). */
export function parseAmount(transcript: string): number | null {
  const m = transcript.replace(/,/g, '').match(/\d+/)
  return m ? Number(m[0]) : null
}

export function resolveSpokenAnswer(q: RenderedQuestion, spoken: SpokenAnswer): VoiceResolution {
  if (spoken.confidence < MIN_STT_CONFIDENCE) return { status: 'no_match' }
  const text = norm(spoken.transcript)
  if (!text) return { status: 'no_match' }
  const ids = new Set(q.options.map((o) => o.id))

  if (ids.has('unsure') && hasPhrase(text, UNSURE)) return { status: 'match', optionId: 'unsure', via: 'unsure', needsConfirmation: true }

  if (q.kind === 'yes_no') {
    const y = hasPhrase(text, YES)
    const n = hasPhrase(text, NO)
    if (y !== n) return { status: 'match', optionId: y ? 'yes' : 'no', via: 'yes_no', needsConfirmation: true }
    return { status: 'no_match' }
  }

  if (q.kind === 'amount_choice') {
    const amt = parseSpokenAmount(spoken.transcript)
    const hit = q.options.find((o) => o.amount !== undefined && o.amount === amt)
    return hit ? { status: 'match', optionId: hit.id, via: 'amount', needsConfirmation: true } : { status: 'no_match' }
  }

  // single_choice: the transcript must contain exactly one option label.
  const hits = q.options.filter((o) => o.id !== 'unsure' && text.includes(norm(o.label)))
  return hits.length === 1 ? { status: 'match', optionId: hits[0].id, via: 'label', needsConfirmation: true } : { status: 'no_match' }
}

// Centralised language configuration for UI, speech recognition (STT) and speech synthesis (TTS).
// One place to add a language. Nothing here depends on React or on the lesson engine.

import type { Lang } from '../i18n/strings'

export interface LanguageConfig {
  code: Lang
  /** BCP-47 tag used for <html lang>, SpeechRecognition.lang and SpeechSynthesisUtterance.lang */
  bcp47: 'en-IN' | 'hi-IN' | 'te-IN'
  /** Name shown to learners, in the language's own script */
  native: string
  englishName: string
  greeting: string
  /** CSS font stack with reliable glyph coverage (fonts are bundled locally, see main.tsx). */
  fontStack: string
  /**
   * Voice lang tags accepted for TTS, best first. Only same-language voices are allowed:
   * we never read Hindi or Telugu text with an English voice.
   */
  voiceLangs: string[]
  /** Words used when amounts and symbols are read aloud. */
  speech: { rupees: string; minus: string; plus: string; equals: string }
}

export const LANGUAGES: Record<Lang, LanguageConfig> = {
  en: {
    code: 'en',
    bcp47: 'en-IN',
    native: 'English',
    englishName: 'English',
    greeting: 'Welcome',
    fontStack: '"Noto Sans", system-ui, sans-serif',
    voiceLangs: ['en-IN', 'en-GB', 'en-US', 'en'],
    speech: { rupees: 'rupees', minus: 'minus', plus: 'plus', equals: 'equals' },
  },
  hi: {
    code: 'hi',
    bcp47: 'hi-IN',
    native: 'हिन्दी',
    englishName: 'Hindi',
    greeting: 'स्वागत है',
    fontStack: '"Noto Sans Devanagari", "Noto Sans", sans-serif',
    voiceLangs: ['hi-IN', 'hi'],
    speech: { rupees: 'रुपये', minus: 'घटा', plus: 'जोड़', equals: 'बराबर' },
  },
  te: {
    code: 'te',
    bcp47: 'te-IN',
    native: 'తెలుగు',
    englishName: 'Telugu',
    greeting: 'స్వాగతం',
    fontStack: '"Noto Sans Telugu", "Noto Sans", sans-serif',
    voiceLangs: ['te-IN', 'te'],
    speech: { rupees: 'రూపాయలు', minus: 'తీసివేస్తే', plus: 'కలిపితే', equals: 'సమానం' },
  },
}

export const LANGUAGE_LIST: LanguageConfig[] = [LANGUAGES.en, LANGUAGES.hi, LANGUAGES.te]

/** Normalises "hi_IN", "HI-in" → "hi-in" for comparisons. */
export const normTag = (tag: string) => tag.replace('_', '-').toLowerCase()

/**
 * Prepares on-screen text for speaking: reads amounts as "1500 rupees" in the learner's language
 * (no Indian-grouping commas, which some engines read as pauses) and speaks − + = as words.
 */
export function toSpeakable(text: string, lang: Lang): string {
  const s = LANGUAGES[lang].speech
  return text
    .replace(/₹\s?([\d,]+)/g, (_, n: string) => `${n.replace(/,/g, '')} ${s.rupees}`)
    .replace(/\s[−-]\s/g, ` ${s.minus} `)
    .replace(/\s\+\s/g, ` ${s.plus} `)
    .replace(/\s=\s/g, ` ${s.equals} `)
    .replace(/[“”"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits long text into sentence-sized chunks (Chrome stops very long utterances). */
export function chunkForSpeech(text: string, max = 160): string[] {
  const parts = text.split(/(?<=[.!?।])\s+/).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    if (out.length && (out[out.length - 1] + ' ' + p).length <= max) out[out.length - 1] += ' ' + p
    else out.push(p)
  }
  return out
}

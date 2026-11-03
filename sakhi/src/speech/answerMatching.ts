// Maps a (possibly corrected) transcript to one of the on-screen options. Deterministic.
// It only proposes an option for the learner to confirm; scoring always happens in the engines.

import type { Lang } from '../i18n/strings'
import { parseSpokenAmounts } from './numbers'

export interface MatchableOption {
  id: string
  label: string
  amount?: number
}

export type MatchResult =
  | { status: 'match'; optionId: string; via: 'amount' | 'yes_no' | 'synonym' | 'label' | 'unsure'; confidence?: 'high' | 'low'; amount?: number }
  | { status: 'no_match'; reason: 'empty' | 'no_amount' | 'amount_not_offered' | 'ambiguous' | 'ambiguous_amount' | 'not_understood'; amounts?: number[] }

/**
 * Spoken synonyms per option id, per language, incl. common English loanwords and romanised forms.
 * Editable for native-speaker review alongside the translations.
 */
export const OPTION_SYNONYMS: Record<string, Partial<Record<Lang, string[]>>> = {
  yes: { en: ['yes', 'yeah', 'yep', 'right'], hi: ['हाँ', 'हां', 'जी', 'जी हाँ', 'haan', 'han', 'ha', 'yes'], te: ['అవును', 'అవునండి', 'ఔను', 'avunu', 'avunandi', 'aunu', 'yes'] },
  no: { en: ['no', 'nope', 'not'], hi: ['नहीं', 'नही', 'nahi', 'nahin', 'no'], te: ['లేదు', 'లేదండి', 'కాదు', 'కాదండి', 'రాలేదు', 'అక్కర్లేదు', 'ledu', 'ledandi', 'kaadu', 'kaadandi', 'kadu', 'raledu', 'akkarledu', 'no'] },
  unsure: {
    en: ['not sure', "don't know", 'dont know', 'no idea'],
    hi: ['पता नहीं', 'मालूम नहीं', 'मुझे नहीं पता', 'pata nahi', 'pata nahin', 'maloom nahi', 'malum nahi', 'nahi pata', 'idea nahi', 'not sure'],
    te: ['తెలియదు', 'తెలీదు', 'తెలియట్లేదు', 'చెప్పలేను', 'teliyadu', 'teledu', 'cheppalenu', 'idea ledu', 'not sure'],
  },
  // Comprehension check: "Did profit go up?"
  up: { en: ['went up', 'increased', 'up', 'yes'], hi: ['बढ़ा', 'बढ़ गया', 'बढ़ गई', 'हाँ', 'हां', 'badha', 'badh gaya', 'badh gayi', 'haan'], te: ['పెరిగింది', 'పెరిగిపోయింది', 'అవును', 'perigindi', 'perigipoyindi', 'avunu'] },
  down: { en: ['went down', 'decreased', 'down', 'less', 'no'], hi: ['घटा', 'घट गया', 'घट गई', 'घटी', 'कम', 'नहीं', 'ghata', 'ghat gaya', 'ghat gayi', 'kam', 'nahi'], te: ['తగ్గింది', 'తగ్గిపోయింది', 'తక్కువ', 'లేదు', 'taggindi', 'taggipoyindi', 'ledu'] },
  // Assessment single-choice options
  stock: { en: ['stock', 'buying'], hi: ['माल', 'सब्ज़ी', 'दूध', 'stock', 'maal', 'sabzi', 'doodh', 'mandi'], te: ['సరుకు', 'కూరగాయలు', 'పాలు', 'stock', 'saruku', 'kooragayalu', 'paalu', 'mandi'] },
  school: { en: ['school', 'fees'], hi: ['स्कूल', 'फ़ीस', 'फीस', 'school', 'fees'], te: ['స్కూల్', 'ఫీజు', 'school', 'fees', 'feeju'] },
  clothes: { en: ['clothes', 'festival'], hi: ['कपड़े', 'त्योहार', 'kapde', 'kapade', 'tyohar', 'clothes'], te: ['బట్టలు', 'పండుగ', 'battalu', 'panduga', 'clothes'] },
  mixed: {
    en: ['mixed', 'mix', 'shop cash', 'together'],
    hi: ['मिलाकर', 'मिला के', 'मिला देती', 'मिला देते', 'मिलाती', 'दुकान', 'milakar', 'mila ke', 'mila kar', 'mila deti', 'mila dete', 'milati', 'ek saath', 'mixed', 'mix'],
    te: ['కలిపి', 'కలిపేస్తాను', 'కలిపేస్తా', 'కలుపుతాను', 'దుకాణం', 'kalipi', 'kalipestanu', 'kaluputanu', 'mixed', 'mix'],
  },
  separate: { en: ['separate', 'separately', 'savings box', 'bank'], hi: ['अलग', 'गुल्लक', 'बैंक', 'alag', 'gullak', 'bank', 'separate'], te: ['విడిగా', 'వేరేగా', 'వేరుగా', 'డబ్బా', 'బ్యాంకు', 'బ్యాంక్', 'vidiga', 'verega', 'veruga', 'dabba', 'bank', 'separate', 'separately'] },
  cashbox: { en: ['cash box', 'whenever'], hi: ['गल्ले', 'गल्ला', 'जब ज़रूरत', 'galle', 'galla', 'gulle', 'jab zarurat', 'jab jarurat'], te: ['గల్లా', 'అవసరమైనప్పుడల్లా', 'galla', 'avasaramainappudu'] },
  fixed: { en: ['fixed', 'set aside'], hi: ['तय', 'निश्चित', 'अलग रखी', 'tay', 'fixed', 'alag rakhi'], te: ['నిర్ణీత', 'వేరుగా', 'పక్కన పెట్టిన', 'veruga', 'pakkana pettina', 'pakkana petti', 'fixed'] },
}

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[.,!?।'"“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

const hasPhrase = (text: string, phrase: string) => text.includes(norm(phrase))

export function matchSpokenAnswer(transcript: string, lang: Lang, options: MatchableOption[]): MatchResult {
  const text = norm(transcript)
  if (!text.trim()) return { status: 'no_match', reason: 'empty' }
  const ids = new Set(options.map((o) => o.id))

  // "Not sure" first: "पता नहीं" contains "नहीं" (no).
  if (ids.has('unsure') && (OPTION_SYNONYMS.unsure[lang] ?? []).concat(OPTION_SYNONYMS.unsure.en ?? []).some((p) => hasPhrase(text, p)))
    return { status: 'match', optionId: 'unsure', via: 'unsure' }

  const amountOptions = options.filter((o) => o.amount !== undefined)
  if (amountOptions.length) {
    const parsed = parseSpokenAmounts(transcript, lang)
    // Several different amounts and no clear final one: never pick one of them (ask which she means).
    if (parsed.ambiguous) return { status: 'no_match', reason: 'ambiguous_amount', amounts: parsed.amounts }
    if (parsed.value === null) return { status: 'no_match', reason: 'no_amount' }
    const hit = amountOptions.find((o) => o.amount === parsed.value)
    return hit
      ? { status: 'match', optionId: hit.id, via: 'amount', confidence: parsed.confidence ?? 'high', amount: parsed.value }
      : { status: 'no_match', reason: 'amount_not_offered', amounts: parsed.amounts }
  }

  // Exact label first, then synonyms; a match must be unambiguous.
  const byLabel = options.filter((o) => o.id !== 'unsure' && hasPhrase(text, o.label))
  if (byLabel.length === 1) return { status: 'match', optionId: byLabel[0].id, via: 'label' }

  const bySyn = options.filter((o) => o.id !== 'unsure' && (OPTION_SYNONYMS[o.id]?.[lang] ?? []).some((p) => hasPhrase(text, p)))
  if (bySyn.length === 1) return { status: 'match', optionId: bySyn[0].id, via: ids.has('yes') ? 'yes_no' : 'synonym' }
  if (bySyn.length > 1) return { status: 'no_match', reason: 'ambiguous' }
  return { status: 'no_match', reason: 'not_understood' }
}

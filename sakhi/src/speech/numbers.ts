// Deterministic parsing of spoken rupee amounts in English, Hindi and Telugu (script and romanised),
// including code-mixed speech ("do sau rupees", "రెండు వందల fifty"). No AI involved.
//
// Reliability rules (from the evaluation, docs/EVAL_RESULTS.md):
// - Every amount in the words is read, not just the first. Two different amounts → ambiguous (ask which one),
//   unless the learner clearly marks the last one as her result ("… karke 440", "… is 300") and does not offer
//   alternatives ("or", "या", "లేదా", "maybe"…).
// - Colloquial fractions are understood: साढ़े (+½), सवा (+¼), पौने (−¼), డెడ్/ढाई, Telugu "-న్నర" (+½).
// - "six fifty"-style amounts (a digit word followed by a tens word, no "hundred") are returned with LOW
//   confidence: the app must ask "Did you mean ₹650?" rather than use them silently.
// - On a given language screen only that language's words (plus English) are read; English screens also read
//   Devanagari/Telugu script number words, but never romanised ones, so English "do" is not 2.

import type { Lang } from '../i18n/strings'

type Word = { v: number; kind: 'unit' } | { v: number; kind: 'hundred'; connective?: boolean } | { v: number; kind: 'thousand'; connective?: boolean } | { v: number; kind: 'mod' }

const unit = (v: number): Word => ({ v, kind: 'unit' })
const HUNDRED: Word = { v: 100, kind: 'hundred' }
const THOUSAND: Word = { v: 1000, kind: 'thousand' }

type Dict = Record<string, Word>
const make = () => {
  const d: Dict = {}
  const add = (v: number | Word, ...ws: string[]) => ws.forEach((w) => (d[w] = typeof v === 'number' ? unit(v) : v))
  return { d, add }
}

// ── English ──
const EN = make()
'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'
  .split(' ')
  .forEach((w, i) => EN.add(i, w))
;['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].forEach((w, i) => EN.add((i + 2) * 10, w))
EN.add(HUNDRED, 'hundred', 'hundreds')
EN.add(THOUSAND, 'thousand', 'thousands')

// ── Hindi (Devanagari + common romanisations) ──
const HI = make()
const HI_WORDS: [number, string[]][] = [
  [1, ['एक', 'ek']], [2, ['दो', 'do']], [3, ['तीन', 'teen']], [4, ['चार', 'char', 'chaar']],
  [5, ['पाँच', 'पांच', 'paanch', 'panch']], [6, ['छह', 'छः', 'छे', 'chhe', 'chhah', 'chhaa']], [7, ['सात', 'saat']],
  [8, ['आठ', 'aath']], [9, ['नौ', 'nau']], [10, ['दस', 'das']], [11, ['ग्यारह', 'gyarah']], [12, ['बारह', 'barah']],
  [13, ['तेरह', 'terah']], [14, ['चौदह', 'chaudah']], [15, ['पंद्रह', 'पन्द्रह', 'pandrah']], [16, ['सोलह', 'solah']],
  [17, ['सत्रह', 'satrah']], [18, ['अठारह', 'atharah']], [19, ['उन्नीस', 'unnees']], [20, ['बीस', 'bees']],
  [25, ['पच्चीस', 'pachchees']], [30, ['तीस', 'tees']], [35, ['पैंतीस', 'paintees']], [40, ['चालीस', 'chalis', 'chaalees']],
  [45, ['पैंतालीस', 'paintalis']], [50, ['पचास', 'pachas', 'pachaas']], [55, ['पचपन', 'pachpan']], [60, ['साठ', 'saath']],
  [65, ['पैंसठ', 'painsath']], [70, ['सत्तर', 'sattar']], [75, ['पचहत्तर', 'pachhattar']], [80, ['अस्सी', 'assi']],
  [85, ['पचासी', 'pachasi']], [90, ['नब्बे', 'nabbe']], [95, ['पंचानबे', 'panchanbe']],
  // डेढ़ = 1½, ढाई = 2½ (used before सौ / हज़ार: डेढ़ सौ = 150, ढाई हज़ार = 2500)
  [1.5, ['डेढ़', 'डेढ', 'dedh', 'dhedh']], [2.5, ['ढाई', 'dhai', 'dhaai']],
]
HI_WORDS.forEach(([v, ws]) => HI.add(v, ...ws))
HI.add(HUNDRED, 'सौ', 'sau')
HI.add(THOUSAND, 'हज़ार', 'हजार', 'hazaar', 'hazar', 'hajar', 'hajaar')
// Modifiers on the next number: साढ़े छह सौ = 6½ × 100 = 650; सवा दो सौ = 225; पौने तीन सौ = 275
HI.add({ v: 0.5, kind: 'mod' }, 'साढ़े', 'साढे', 'साड़े', 'saade', 'saadhe', 'sadhe', 'sade', 'saarhe')
HI.add({ v: 0.25, kind: 'mod' }, 'सवा', 'sava', 'sawa', 'savva')
HI.add({ v: -0.25, kind: 'mod' }, 'पौने', 'paune', 'pone')

// ── Telugu (script + romanisations) ──
const TE = make()
const TE_WORDS: [number, string[]][] = [
  [1, ['ఒకటి', 'ఒక', 'okati']], [2, ['రెండు', 'rendu']], [3, ['మూడు', 'moodu', 'mudu']], [4, ['నాలుగు', 'nalugu', 'naalugu']],
  [5, ['ఐదు', 'అయిదు', 'aidu', 'ayidu']], [6, ['ఆరు', 'aaru']], [7, ['ఏడు', 'edu']], [8, ['ఎనిమిది', 'enimidi']],
  [9, ['తొమ్మిది', 'tommidi']], [10, ['పది', 'padi']], [11, ['పదకొండు', 'padakondu']], [12, ['పన్నెండు', 'pannendu']], [13, ['పదమూడు', 'padamudu', 'padamoodu']],
  [14, ['పద్నాలుగు', 'padnalugu']], [15, ['పదిహేను', 'padihenu', 'padihen']], [16, ['పదహారు', 'padaharu', 'padahaaru']], [17, ['పదిహేడు', 'padihedu']],
  [18, ['పద్దెనిమిది', 'paddenimidi']], [19, ['పందొమ్మిది', 'pandommidi']], [20, ['ఇరవై', 'iravai', 'iruvai', 'iravay']],
  [30, ['ముప్పై', 'ముప్ఫై', 'muppai', 'muppay']], [40, ['నలభై', 'నలబై', 'nalabhai', 'nalabai', 'nalabay']],
  [50, ['యాభై', 'యాబై', 'yabhai', 'yabai', 'yaabhai', 'yaabai', 'yabhay', 'yaabhay']], [60, ['అరవై', 'aravai', 'aravay']],
  [70, ['డెబ్బై', 'debbai', 'debbay']], [80, ['ఎనభై', 'ఎనబై', 'enabhai', 'enabai']], [90, ['తొంభై', 'తొంబై', 'tombhai', 'tombai']],
  // X-and-a-half: ఆరున్నర వందలు = 6½ × 100 = 650
  [1.5, ['ఒకటిన్నర', 'okatinnara']], [2.5, ['రెండున్నర', 'rendunnara']], [3.5, ['మూడున్నర', 'moodunnara']],
  [4.5, ['నాలుగున్నర', 'nalugunnara', 'naalugunnara']], [5.5, ['ఐదున్నర', 'aidunnara']], [6.5, ['ఆరున్నర', 'aarunnara']],
  [7.5, ['ఏడున్నర', 'edunnara']], [8.5, ['ఎనిమిదిన్నర']], [9.5, ['తొమ్మిదిన్నర']],
]
TE_WORDS.forEach(([v, ws]) => TE.add(v, ...ws))
TE.add(HUNDRED, 'వందలు', 'vandalu', 'వంద', 'vanda')
TE.add(THOUSAND, 'వేలు', 'velu', 'వెయ్యి', 'veyyi')
// Connective forms ("వందల యాభై" = hundred-AND-fifty) promise that more of the number follows.
const CONNECTIVE_HUNDRED: Word = { v: 100, kind: 'hundred', connective: true }
const CONNECTIVE_THOUSAND: Word = { v: 1000, kind: 'thousand', connective: true }
TE.add(CONNECTIVE_HUNDRED, 'వందల', 'vandala')
TE.add(CONNECTIVE_THOUSAND, 'వేల', 'vela')
// Colloquial fused hundreds: రెండొందలు = 200, ఐదొందలు = 500 …
const TE_FUSED: [number, string][] = [[2, 'రెండొందలు'], [3, 'మూడొందలు'], [4, 'నాలుగొందలు'], [5, 'ఐదొందలు'], [6, 'ఆరొందలు'], [7, 'ఏడొందలు'], [8, 'ఎనిమిదొందలు'], [9, 'తొమ్మిదొందలు']]
TE_FUSED.forEach(([n, w]) => {
  TE.add(n * 100, w)
  TE.add(n * 100, w.replace(/లు$/, 'ల'))
})

const scriptOnly = (d: Dict) => Object.fromEntries(Object.entries(d).filter(([w]) => /[^\x00-\x7f]/.test(w)))
const DICTS: Record<Lang | 'any', Dict> = {
  // English screens also read Hindi/Telugu *script* number words (they cannot collide with English words),
  // but not romanised ones like "do" (2) or "teen" (3), which do.
  en: { ...scriptOnly(HI.d), ...scriptOnly(TE.d), ...EN.d },
  hi: { ...EN.d, ...HI.d },
  te: { ...EN.d, ...TE.d },
  any: { ...EN.d, ...HI.d, ...TE.d },
}

/** Words that join parts of one amount ("two hundred and fifty", "एक हज़ार और पाँच सौ"). */
const JOINERS = new Set(['and', 'aur', 'और'])
/** Words that offer alternatives: their presence means the learner has not settled on one amount. */
const ALTERNATION = /(^|\s)(or|maybe|perhaps|either|ya|yaa|shayad|या|शायद|अथवा|leda|లేదా|emo|ఏమో|బహుశా)(?=\s|$)/
/** Words that mark the last amount as the learner's result ("… karke 440", "… is 300", "… అయింది"). */
const RESULT_MARKER = /(^|\s)(=|equals?|is|so|total|comes|left|karke|kar ke|toh|to|matlab|yani|bacha|bache|hua|hue|milakar|kul|करके|तो|मतलब|यानी|बचा|बचे|हुआ|हुए|मिलाकर|मिला के|कुल|కలిపి|అంటే|ante|ayyindi|అయింది|migilindi|మిగిలింది|vachindi|వచ్చింది)(?=\s|$)/

/** Currency words may follow a connective form: "మూడు వందల రూపాయలు" = ₹300. */
const CURRENCY = /^(rupees?|rs|rupaye|rupaya|rupay|rupaiya|rupayalu|rupaayalu|rupayi|రూపాయలు|రూపాయి|రూపాయల|రూ|रुपये|रुपए|रुपया|रुपैया|रु)$/
/** Negation right after (hi/te) or before (en) an amount: "पंद्रह सौ नहीं", "పదిహేను వందలు కాదు", "not fifteen hundred". */
const NEG_AFTER = new Set(['नहीं', 'नही', 'nahi', 'nahin', 'కాదు', 'kaadu', 'kadu'])
const NEG_BEFORE = new Set(['not'])

/** Looks a token up, also in its emphatic form: "ఏడు వందలే" ("only seven hundred"), "edu vandale". */
function lookup(dict: Dict, tok: string | undefined, te: boolean): Word | undefined {
  if (!tok) return undefined
  if (dict[tok]) return dict[tok]
  if (tok.endsWith('\u0c47')) return dict[tok.slice(0, -1)] // ే → inherent a: వందలే → వందల
  if (te && tok.length >= 5 && /[a-z]e$/.test(tok)) return dict[tok.slice(0, -1) + 'a'] ?? dict[tok.slice(0, -1) + 'u'] // vandale → vandala, ede → edu
  return undefined
}

const DEV = '०१२३४५६७८९'
const TEL = '౦౧౨౩౪౫౬౭౮౯'
const normalise = (s: string) =>
  [...s.normalize('NFC')]
    .map((ch) => (DEV.includes(ch) ? String(DEV.indexOf(ch)) : TEL.includes(ch) ? String(TEL.indexOf(ch)) : ch))
    .join('')
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/(\d)\.(\d)/g, '$1\u2024$2') // keep "6.5" together (STT may write "6.5 सौ")
    .replace(/[-–]/g, ' ')
    .replace(/[₹]/g, ' ')
    .replace(/([.,!?।;:])/g, ' $1 ')
    .replace(/\u2024/g, '.')
    .replace(/\s+/g, ' ')
    .trim()

interface Group {
  value: number
  colloquialPair: boolean
  /** A connective "వందల/vandala" ended the amount but no number followed ("ఆరు వందల <unclear word>"). */
  truncated?: boolean
  negated?: boolean
}

export interface SpokenAmounts {
  /** The amount the learner gave, or null if none / ambiguous. */
  value: number | null
  /** 'low' = a guess-like reading ("six fifty" → 650): confirm with the learner before using it. */
  confidence: 'high' | 'low' | null
  /** Every distinct amount heard, in order. */
  amounts: number[]
  /** Several different amounts and no clear final one: ask which she means. */
  ambiguous: boolean
}

/** Reads all amounts in a transcript. Pure and deterministic. */
export function parseSpokenAmounts(transcript: string, lang?: Lang): SpokenAmounts {
  const dict = DICTS[lang ?? 'any']
  const te = lang === 'te' || lang === undefined
  const tokens = normalise(transcript).split(' ').filter(Boolean)
  const groups: Group[] = []
  const between: string[] = [] // words between consecutive groups
  let cur: { total: number; current: number; mod: number; tokens: Word[]; before?: string; guess?: boolean } | null = null
  let gap: string[] = []

  const close = (next?: string) => {
    if (!cur) return
    if (cur.tokens.every((t) => t.kind === 'mod')) {
      cur = null // a lone "साढ़े" / "सवा" with no number is not an amount
      return
    }
    const value = Math.round(cur.total + cur.current)
    const [a, b] = cur.tokens
    const lastW = cur.tokens.at(-1)
    const truncated = !!lastW && lastW.kind !== 'unit' && lastW.kind !== 'mod' && !!lastW.connective && next !== undefined && !CURRENCY.test(next)
    const negated = NEG_AFTER.has(next ?? '') || NEG_BEFORE.has(cur.before ?? '')
    // "six fifty" / "छह पचास" / "ఆరు యాభై": digit word + tens word, no hundred → probably 650, but not certain.
    const colloquialPair =
      cur.tokens.length === 2 && a.kind === 'unit' && b.kind === 'unit' && a.v >= 1 && a.v <= 9 && Number.isInteger(a.v) && b.v >= 20 && b.v <= 90 && b.v % 10 === 0
    groups.push(colloquialPair ? { value: a.v * 100 + b.v, colloquialPair, negated } : { value, colloquialPair: false, truncated: truncated || !!cur.guess, negated })
    cur = null
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (/^\d+(\.\d+)?$/.test(tok)) {
      const n = Number(tok)
      const last = cur?.tokens.at(-1)
      // STT often writes digits inside spoken words (number normalisation):
      // "साढ़े 6 सौ" → the pending modifier applies to the digit; "6 వందల 50" → the digit completes the amount.
      if (cur && last?.kind === 'mod') {
        if (n < 100) {
          cur.tokens.push({ v: n, kind: 'unit' })
          cur.current += n + cur.mod
          cur.mod = 0
        } else {
          // "साढ़े 600": STT turned "छह सौ" into 600 and left साढ़े — probably 650, but only a guess.
          const hundreds = n % 100 === 0 && n < 1000 ? n / 100 : null
          cur.tokens.push({ v: n, kind: 'unit' })
          cur.current += hundreds !== null ? (hundreds + cur.mod) * 100 : n
          cur.mod = 0
          cur.guess = hundreds !== null
        }
        continue
      }
      if (cur && last && (last.kind === 'hundred' || last.kind === 'thousand') && n < 100 && Number.isInteger(n)) {
        cur.tokens.push({ v: n, kind: 'unit' })
        cur.current += n
        continue
      }
      // A written number starts its own amount (it may still be multiplied: "2 hundred", "2 हज़ार").
      close()
      if (groups.length) between.push(gap.join(' '))
      gap = []
      cur = { total: 0, current: n, mod: 0, tokens: [{ v: n, kind: 'unit' }], before: tokens[i - 1] }
      continue
    }
    const w = lookup(dict, tok, te)
    if (!w) {
      // "two hundred AND fifty" joins; "1500 और 100" (1500 plus 100) does not.
      const nx = lookup(dict, tokens[i + 1], te)
      if (cur && JOINERS.has(tok) && nx?.kind === 'unit' && nx.v < 100 && cur.current >= 100 && cur.current % 100 === 0) continue
      close(tok)
      gap.push(tok)
      continue
    }
    if (!cur) {
      if (groups.length) between.push(gap.join(' '))
      gap = []
      cur = { total: 0, current: 0, mod: 0, tokens: [], before: tokens[i - 1] }
    }
    cur.tokens.push(w)
    if (w.kind === 'mod') cur.mod += w.v
    else if (w.kind === 'unit') {
      cur.current += w.v + cur.mod
      cur.mod = 0
    } else if (w.kind === 'hundred') {
      if (cur.current >= 100) {
        // "पंद्रह सौ … सौ": a second "hundred" after a complete hundreds amount is a new amount.
        cur.tokens.pop()
        close(tok)
        if (groups.length) between.push(gap.join(' '))
        gap = []
        cur = { total: 0, current: 100, mod: 0, tokens: [w], before: tokens[i - 1] }
        continue
      }
      cur.current = ((cur.current || 1) + cur.mod) * 100
      cur.mod = 0
    } else {
      cur.total += ((cur.current || 1) + cur.mod) * 1000
      cur.current = 0
      cur.mod = 0
    }
  }
  close()

  const text = ` ${tokens.join(' ')} `
  const alternatives = ALTERNATION.test(text)
  // "twelve hundred, not fifteen hundred" / "बारह सौ, पंद्रह सौ नहीं": the negated amount is ruled out,
  // but only when exactly one other amount remains and no alternatives were offered.
  const kept = groups.filter((g) => !g.negated)
  const keptValues = [...new Set(kept.map((g) => g.value))]
  if (!alternatives && kept.length < groups.length && keptValues.length === 1) {
    const g = kept.at(-1)!
    return { value: g.value, confidence: g.colloquialPair || g.truncated ? 'low' : 'high', amounts: [...new Set(groups.map((x) => x.value))], ambiguous: false }
  }
  const amounts = [...new Set(groups.map((g) => g.value))]
  if (!amounts.length) return { value: null, confidence: null, amounts: [], ambiguous: false }
  if (amounts.length === 1) {
    // "ఆరు వందల <unknown word>" ended on a connective form: probably more digits were said. Ask, don't assume.
    const low = groups.every((g) => g.colloquialPair) || groups.some((g) => g.truncated)
    return { value: amounts[0], confidence: low ? 'low' : 'high', amounts, ambiguous: false }
  }
  const finalMarked = RESULT_MARKER.test(` ${between.at(-1) ?? ''} `)
  if (!alternatives && finalMarked) {
    const last = groups.at(-1)!
    return { value: last.value, confidence: last.colloquialPair || last.truncated ? 'low' : 'high', amounts, ambiguous: false }
  }
  return { value: null, confidence: null, amounts, ambiguous: true }
}

/**
 * Returns the amount in whole rupees, or null when the words contain no amount or several different amounts.
 * Digits and number words in any of the three languages are read.
 */
export function parseSpokenAmount(transcript: string, lang?: Lang): number | null {
  return parseSpokenAmounts(transcript, lang).value
}

// Multilingual regression tests (2026-10-30 multilingual round, docs/EVAL_RESULTS.md §5).
// Each block reproduces a failure from the language-consistency baseline (tests/evals/results/consistency-baseline.md)
// or the held-out probes, plus guards against over-correcting. All Hindi/Telugu inputs: developer-written,
// pending native-speaker review.
import { describe, expect, it } from 'vitest'
import { interpretUtterance, type UtteranceIntent } from '../intent'
import { parseSpokenAmounts } from '../numbers'

type L = 'en' | 'hi' | 'te'
const yesNo = (lang: L) => {
  const t = { en: ['Yes', 'No', 'I’m not sure'], hi: ['हाँ', 'नहीं', 'पता नहीं'], te: ['అవును', 'లేదు', 'తెలియదు'] }[lang]
  return [
    { id: 'yes', label: t[0] },
    { id: 'no', label: t[1] },
    { id: 'unsure', label: t[2] },
  ]
}
const amounts = (...a: number[]) => [...a.map((v, i) => ({ id: `o${i}`, label: `₹${v}`, amount: v })), { id: 'unsure', label: 'x' }]
const expA = (lang: L) => [
  { id: 'stock', label: { en: 'Buying vegetables at the mandi', hi: 'मंडी से सब्ज़ी खरीदना', te: 'మండీలో కూరగాయలు కొనడం' }[lang] },
  { id: 'school', label: { en: 'Your child’s school fees', hi: 'बच्चे की स्कूल फ़ीस', te: 'పిల్లల స్కూల్ ఫీజు' }[lang] },
  { id: 'unsure', label: 'x' },
]
const savB = (lang: L) => [
  { id: 'mixed', label: { en: 'Mixed with the shop cash', hi: 'दुकान के पैसों के साथ मिलाकर', te: 'దుకాణం డబ్బుతో కలిపి' }[lang] },
  { id: 'separate', label: { en: 'Separately, like a savings box or bank account', hi: 'अलग से, जैसे गुल्लक या बैंक खाते में', te: 'విడిగా, పొదుపు డబ్బా లేదా బ్యాంకు ఖాతాలో' }[lang] },
  { id: 'unsure', label: 'x' },
]
const kind = (r: UtteranceIntent) => (r.kind === 'clarification_request' ? `clarify:${r.mode}` : r.kind === 'answer' ? `answer:${r.optionId}` : r.kind)

describe('CRITICAL (baseline): "I don\'t know" phrasings that contain the word for "No" are uncertainty, not "No"', () => {
  // Baseline: all six were scored as the CORRECT answer "No" (FALSE_CORRECT) on rvp_a / crd_a.
  it.each([
    ['hi', 'मुझे नहीं पता'],
    ['hi', 'mujhe nahi pata'],
    ['hi', 'mujhe sure nahi hai'],
    ['hi', 'पक्का नहीं पता'],
    ['hi', 'pakka nahi pata'],
    ['hi', 'sure nahi hoon'],
    ['hi', 'mujhe idea nahi'],
    ['te', 'naaku idea ledu'],
    ['te', 'sure ga cheppalenu'],
    ['te', 'ఏమో, తెలియదు'],
    ['en', "I really don't know"],
  ] as const)('%s “%s” → the “not sure” option', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('answer:unsure')
  })
  it('over-correction guard: a real "No" that mentions knowing is still "No"', () => {
    expect(kind(interpretUtterance('नहीं, पता है, मुनाफ़ा दो सौ है', 'hi', yesNo('hi')))).toBe('answer:no')
    expect(kind(interpretUtterance('nahi, 500 to sales hai, profit nahi', 'hi', yesNo('hi')))).toBe('answer:no')
    expect(kind(interpretUtterance('ledu, 500 sales matrame, profit kaadu', 'te', yesNo('te')))).toBe('answer:no')
  })
})

describe('CRITICAL (baseline): romanised Telugu amounts', () => {
  it('“motham aaru vandala yaabhai rupayalu” is ₹650, not ₹600 (was scored as the misconception)', () => {
    expect(parseSpokenAmounts('motham aaru vandala yaabhai rupayalu', 'te')).toMatchObject({ value: 650, confidence: 'high' })
    expect(kind(interpretUtterance('motham aaru vandala yaabhai rupayalu', 'te', amounts(650, 600)))).toBe('answer:o0')
  })
  it('a connective "వందల/vandala" followed by an unknown word is never read as a confident round hundred', () => {
    // An unrecognised spelling of "fifty" must not silently become ₹600.
    expect(parseSpokenAmounts('aaru vandala yaaabhaii', 'te')).toMatchObject({ value: 600, confidence: 'low' })
    expect(parseSpokenAmounts('ఆరు వందల రూపాయలు', 'te')).toMatchObject({ value: 600, confidence: 'high' })
    expect(parseSpokenAmounts('moodu vandala rupayalu labham', 'te')).toMatchObject({ value: 300, confidence: 'high' })
  })
  it.each([
    ['ఏడు వందలే', 700],
    ['edu vandale', 700],
    ['pannendu vandalu', 1200],
    ['padihenu vandalu', 1500],
    ['rendu vandala yabai', 250],
  ] as const)('“%s” → ₹%i', (said, v) => {
    expect(parseSpokenAmounts(said, 'te').value).toBe(v)
  })
})

describe('Requests for a simpler explanation (new intent mode)', () => {
  it.each([
    ['en', 'Can you explain it in simpler words?'],
    ['en', 'Explain it more simply please'],
    ['hi', 'थोड़ा आसान भाषा में समझाइए'],
    ['hi', 'aasaan karke batao'],
    ['hi', 'simple words mein samjhao'],
    ['hi', 'थोड़ा सरल करके समझाइए'],
    ['te', 'కొంచెం సులభంగా చెప్పండి'],
    ['te', 'inka suluvuga cheppandi'],
    ['te', 'simple ga explain cheyyandi'],
    ['te', 'సింపుల్‌గా చెప్పండి'],
  ] as const)('%s “%s” → clarify:simplify', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('clarify:simplify')
  })
  it.each([
    ['en', 'what is a business expense?'], // held-out EXP-EN-31
    ['hi', 'business expense ka matlab kya hai?'],
    ['hi', 'उधार क्या होता है?'],
    ['te', 'వ్యాపార ఖర్చు అంటే ఏమిటి?'],
    ['te', 'credit ante enti?'],
  ] as const)('a question about the concept, %s “%s” → clarify:simplify (not “unrelated”)', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, expA(lang)))).toBe('clarify:simplify')
  })
  it('“explain simply AND again” is a simplify request', () => {
    expect(kind(interpretUtterance('फिर से आसान भाषा में बताइए', 'hi', yesNo('hi')))).toBe('clarify:simplify')
  })
  it('over-correction guards: answers stay answers', () => {
    expect(kind(interpretUtterance('what is the profit? three hundred', 'en', amounts(300, 1000)))).toBe('answer:o0')
    expect(kind(interpretUtterance('मुनाफ़ा मतलब तीन सौ', 'hi', amounts(300, 1000)))).toBe('answer:o0')
    expect(kind(interpretUtterance('I mean cash, seven hundred', 'en', amounts(700, 900)))).toBe('answer:o0')
  })
})

describe('Repeat requests: romanised and code-mixed forms (baseline failures)', () => {
  it.each([
    ['en', 'Could you read the question one more time?'], // held-out RVP-EN-31
    ['en', 'One more time please'],
    ['hi', 'dobara padh ke sunaiye'],
    ['hi', 'one more time boliye'],
    ['te', 'మళ్ళీ చదివి వినిపించండి'],
    ['te', 'malli chadivi vinipinchandi'],
    ['te', 'once more cheppandi'],
    ['te', 'one more time cheppandi'],
    ['te', 'question malli repeat cheyyandi'],
  ] as const)('%s “%s” → clarify:repeat', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('clarify:repeat')
  })
  it('over-correction guard: “I counted once more, 300” is an answer', () => {
    expect(kind(interpretUtterance('I counted once more, three hundred', 'en', amounts(300, 1000)))).toBe('answer:o0')
    expect(kind(interpretUtterance('malli lekka chesanu, moodu vandalu', 'te', amounts(300, 1000)))).toBe('answer:o0')
  })
})

describe('Meaning-level and romanised answer synonyms (baseline failures)', () => {
  it.each([
    ['te', 'ఇంకా రాలేదు', 'no'], // held-out CRD-TE-31
    ['te', 'inka raledu, repu istaru', 'no'],
  ] as const)('%s “%s” → %s', (lang, said, opt) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe(`answer:${opt}`)
  })
  it.each([
    ['hi', 'dukaan ke paison mein hi mila deti hoon', 'mixed'],
    ['hi', 'shop cash ke saath mix kar deti hoon', 'mixed'],
    ['te', 'dukanam dabbutho kalipestanu', 'mixed'],
    ['te', 'పొదుపు డబ్బు వేరేగా దాచాలి', 'separate'],
  ] as const)('%s “%s” → %s', (lang, said, opt) => {
    expect(kind(interpretUtterance(said, lang, savB(lang)))).toBe(`answer:${opt}`)
  })
})

describe('Unrelated commands (not only questions)', () => {
  it.each([
    ['en', 'tell me a joke'], // held-out CRD-EN-33
    ['hi', 'मुझे एक गाना सुनाओ'],
    ['hi', 'koi story sunao'],
    ['te', 'ఒక కథ చెప్పండి'],
    ['te', 'cricket score cheppu'],
  ] as const)('%s “%s” → unrelated', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('unrelated')
  })
  it('over-correction guard: “tell me the answer” and “batao, profit kitna?” are not unrelated', () => {
    expect(kind(interpretUtterance('tell me the answer', 'en', yesNo('en')))).not.toBe('unrelated')
    expect(kind(interpretUtterance('batao, profit kitna hai?', 'hi', yesNo('hi')))).not.toBe('unrelated')
  })
})

describe('"X, not Y" amounts', () => {
  it.each([
    ['en', 'twelve hundred, not fifteen hundred', 1200], // held-out CRD-EN-32
    ['hi', 'बारह सौ, पंद्रह सौ नहीं', 1200],
    ['te', 'పన్నెండు వందలు, పదిహేను వందలు కాదు', 1200],
  ] as const)('%s “%s” → ₹%i', (lang, said, v) => {
    expect(parseSpokenAmounts(said, lang)).toMatchObject({ value: v, ambiguous: false })
  })
  it('alternatives still win: “not 1200, or maybe 1500” is ambiguous', () => {
    expect(parseSpokenAmounts('not 1200, or maybe 1500', 'en').ambiguous).toBe(true)
  })
})

describe('Held-out v2 findings (fixed after its single untuned run)', () => {
  it.each([
    ['te', 'కాదండి, ఖర్చు తీసేయాలి', 'no'], // polite fused forms: kaadu/avunu + andi
    ['te', 'అవునండి, వచ్చినట్టే', 'yes'],
    ['te', 'లేదండి', 'no'],
    ['te', 'అక్కర్లేదు', 'no'],
  ] as const)('%s “%s” → %s', (lang, said, opt) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe(`answer:${opt}`)
  })
  it('“తగ్గిపోయింది” (went down) is the “down” option', () => {
    const upDown = [
      { id: 'up', label: 'పెరిగింది' },
      { id: 'down', label: 'తగ్గింది' },
      { id: 'unsure', label: 'తెలియదు' },
    ]
    expect(kind(interpretUtterance('తగ్గిపోయింది', 'te', upDown))).toBe('answer:down')
  })
  it.each([
    ['en', "I'm confused", 'clarify:simplify'],
    ['hi', 'ये थोड़ा मुश्किल है, समझाओ ना', 'clarify:simplify'],
    ['te', 'ఆటో ఖర్చు కూడా కలపాలా? అర్థమయ్యేలా చెప్పండి', 'clarify:simplify'],
    ['te', 'ఏమన్నారు? మళ్ళీ అడగండి', 'clarify:repeat'],
  ] as const)('%s “%s” → %s', (lang, said, k) => {
    expect(kind(interpretUtterance(said, lang, amounts(650, 600)))).toBe(k)
  })
  it.each([
    ['hi', 'post office की स्कीम में डालूँ?'],
    ['hi', 'scheme mein daal doon?'],
    ['te', 'పోస్ట్ ఆఫీస్ లో వేయాలా?'],
  ] as const)('savings-product question %s “%s” → advice redirect (never the answer “bank / separate”)', (lang, said) => {
    expect(interpretUtterance(said, lang, savB(lang))).toEqual({ kind: 'out_of_scope', reason: 'advice' })
  })
})

describe('English loanwords written in Devanagari / Telugu script (how STT often transcribes code-mixed speech)', () => {
  it.each([
    ['hi', 'रिपीट कीजिए', 'clarify:repeat'],
    ['te', 'రిపీట్ చేయండి', 'clarify:repeat'],
    ['hi', 'सिंपल भाषा में बताइए', 'clarify:simplify'],
    ['te', 'సింపుల్‌గా ఎక్స్‌ప్లెయిన్ చేయండి', 'clarify:simplify'],
    ['hi', 'मुझे आइडिया नहीं है', 'answer:unsure'],
    ['te', 'నాకు ఐడియా లేదు', 'answer:unsure'],
    ['te', 'ఒక జోక్ చెప్పండి', 'unrelated'],
  ] as const)('%s “%s” → %s', (lang, said, k) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe(k)
  })
  it.each([
    ['hi', 'प्रॉफ़िट तीन सौ'],
    ['te', 'ప్రాఫిట్ మూడు వందలు'],
  ] as const)('%s “%s” → ₹300', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, amounts(300, 1000)))).toBe('answer:o0')
  })
})

describe('Amounts in which STT wrote some words as digits (number normalisation)', () => {
  it.each([
    ['hi', 'साढ़े 6 सौ', 650, 'high'],
    ['hi', '6.5 सौ', 650, 'high'],
    ['hi', '2.5 सौ', 250, 'high'],
    ['te', '6 వందల 50', 650, 'high'],
    ['hi', 'साढ़े 600', 650, 'low'], // probably "साढ़े छह सौ", but a guess: the app asks "Did you mean ₹650?"
    ['hi', 'सवा 200', 225, 'low'],
  ] as const)('%s “%s” → ₹%i (%s confidence)', (lang, said, v, conf) => {
    expect(parseSpokenAmounts(said, lang)).toMatchObject({ value: v, confidence: conf, ambiguous: false })
  })
  it('previous behaviour was safe but unhelpful: “साढ़े 600” was two amounts (0 and 600) → "which one?"; never ₹600', () => {
    expect(parseSpokenAmounts('साढ़े 600', 'hi').amounts).not.toContain(0)
    expect(parseSpokenAmounts('साढ़े 600', 'hi').value).not.toBe(600)
  })
  it('two written numbers are still two amounts', () => {
    expect(parseSpokenAmounts('600 50', 'hi').ambiguous).toBe(true)
  })
})

describe('Round 2 (held-out v3 + lesson-screen consistency baseline findings)', () => {
  it.each([
    ['en', "I'm not too sure"], // CRITICAL in held-out v3 CRD-EN-51: "not" matched "No" (the correct answer)
    ['en', 'not really sure'],
    ['en', 'not a hundred percent sure'],
    ['te', 'నాకు తెల్వదు'], // Telangana
    ['te', 'naku teliyadhu'],
    ['te', 'telvadu andi'],
    ['hi', 'nai maloom'],
  ] as const)('%s “%s” → not sure (never “No”)', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('answer:unsure')
  })
  it('over-correction guard: a plain English "No" with "not" is still "No"', () => {
    expect(kind(interpretUtterance("No, it's not cash yet", 'en', yesNo('en')))).toBe('answer:no')
    expect(kind(interpretUtterance('not yet, she will pay tomorrow', 'en', yesNo('en')))).toBe('answer:no')
  })
  it.each([
    ['en', 'what did you say?'],
    ['hi', 'आपने क्या कहा?'],
    ['hi', 'kya bola aapne?'],
    ['te', 'ఏం అన్నారు?'],
    ['te', 'meeru emannaru?'],
  ] as const)('%s “%s” → clarify:repeat (was “unrelated”)', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('clarify:repeat')
  })
  it.each([
    ['hi', 'फ़ायदा मतलब क्या होता है?'],
    ['hi', 'nafa kya hota hai?'],
    ['te', 'ఆదాయం అంటే ఏమిటి?'],
  ] as const)('everyday words for profit/income: %s “%s” → clarify:simplify', (lang, said) => {
    expect(kind(interpretUtterance(said, lang, yesNo(lang)))).toBe('clarify:simplify')
  })
  it('a yes/no answer that mentions फ़ायदा is still an answer', () => {
    expect(kind(interpretUtterance('जी हाँ, पूरा फ़ायदा है', 'hi', yesNo('hi')))).toBe('answer:yes')
    expect(kind(interpretUtterance('नहीं, पाँच सौ फ़ायदा नहीं है', 'hi', yesNo('hi')))).toBe('answer:no')
  })
  it.each([
    ['मुनाफ़ा घट गया', 'down'],
    ['munafa ghat gaya', 'down'],
    ['haan badh gaya', 'up'],
  ] as const)('lesson check: hi “%s” → %s', (said, opt) => {
    const upDown = [
      { id: 'up', label: 'हाँ, क्योंकि बिक्री बढ़ी' },
      { id: 'down', label: 'नहीं, मुनाफ़ा घटा' },
      { id: 'unsure', label: 'पता नहीं' },
    ]
    expect(kind(interpretUtterance(said, 'hi', upDown))).toBe(`answer:${opt}`)
  })
})

// Regression tests for the critical failures found by the evaluation (docs/EVAL_RESULTS.md, run of 2026-10-29),
// plus guards against over-correcting (real answers must still be understood).
import { describe, expect, it } from 'vitest'
import { interpretUtterance } from '../intent'
import { parseSpokenAmounts } from '../numbers'
import { matchSpokenAnswer } from '../answerMatching'

const yesNo = (lang: 'en' | 'hi' | 'te') => {
  const L = { en: ['Yes', 'No', 'I’m not sure'], hi: ['हाँ', 'नहीं', 'पता नहीं'], te: ['అవును', 'లేదు', 'తెలియదు'] }[lang]
  return [
    { id: 'yes', label: L[0] },
    { id: 'no', label: L[1] },
    { id: 'unsure', label: L[2] },
  ]
}
const amounts = (...a: number[]) => [...a.map((v, i) => ({ id: `o${i}`, label: `₹${v}`, amount: v })), { id: 'unsure', label: 'I’m not sure' }]
const savB = (lang: 'en' | 'hi' | 'te') => [
  { id: 'mixed', label: { en: 'Mixed with the shop cash', hi: 'दुकान के पैसों के साथ मिलाकर', te: 'దుకాణం డబ్బుతో కలిపి' }[lang] },
  { id: 'separate', label: { en: 'Separately, like a savings box or bank account', hi: 'अलग से, जैसे गुल्लक या बैंक खाते में', te: 'విడిగా, పొదుపు డబ్బా లేదా బ్యాంకు ఖాతాలో' }[lang] },
  { id: 'unsure', label: 'x' },
]

describe('CRITICAL F1: a request to repeat / "not understood" is never an answer (RVP-HI-10, CRD-EN-08)', () => {
  it.each([
    ['en', 'I do not understand, please say it again'],
    ['en', 'Sorry, can you explain that again?'],
    ['en', "I didn't understand"],
    ['hi', 'फिर से बताइए, समझ नहीं आया'],
    ['hi', 'samajh nahi aaya, phir se batao'],
    ['te', 'మళ్ళీ చెప్పండి, అర్థం కాలేదు'],
    ['te', 'ఇంకోసారి వినిపించండి'],
    ['te', 'artham kaaledu, malli cheppandi'],
  ] as const)('%s “%s” → clarification_request', (lang, said) => {
    const r = interpretUtterance(said, lang, yesNo(lang))
    expect(r.kind).toBe('clarification_request')
  })
  it('the old bug: these words matched the option "No"', () => {
    // Documented root cause: "नहीं"/"not" are synonyms of "No" and matching looked for them anywhere in the sentence.
    expect(matchSpokenAnswer('फिर से बताइए, समझ नहीं आया', 'hi', yesNo('hi')).status).toBe('match')
    expect(interpretUtterance('फिर से बताइए, समझ नहीं आया', 'hi', yesNo('hi')).kind).not.toBe('answer')
  })
  it('real answers are still answers', () => {
    expect(interpretUtterance('नहीं, मुनाफ़ा ₹500 नहीं है', 'hi', yesNo('hi'))).toMatchObject({ kind: 'answer', optionId: 'no' })
    expect(interpretUtterance('No, profit is not 500', 'en', yesNo('en'))).toMatchObject({ kind: 'answer', optionId: 'no' })
    expect(interpretUtterance('మళ్ళీ లెక్కపెట్టాను, మూడు వందలు', 'te', amounts(300, 1000))).toMatchObject({ kind: 'answer', optionId: 'o0' }) // "I counted again, 300"
    expect(interpretUtterance('maine phir se gina, 300', 'hi', amounts(300, 1000))).toMatchObject({ kind: 'answer', optionId: 'o0' })
  })
})

describe('uncertainty is respected, never scored as a wrong financial answer', () => {
  it.each([
    ['en', "I'm not sure"],
    ['en', 'I think 500 but I am not sure'],
    ['hi', 'पता नहीं'],
    ['te', 'తెలియదు'],
  ] as const)('%s “%s” → the "not sure" option', (lang, said) => {
    expect(interpretUtterance(said, lang, amounts(200, 500))).toMatchObject({ kind: 'answer', optionId: 'unsure' })
  })
  it('without a "not sure" option it is reported as uncertain, not as an answer', () => {
    expect(interpretUtterance("I'm not sure", 'en', amounts(200, 500).slice(0, 2)).kind).toBe('uncertain')
  })
})

describe('CRITICAL F5: sensitive information is never accepted as an answer, on any screen (SAV-HI-06)', () => {
  it.each([
    ['hi', 'मेरा बैंक खाता नंबर 123456789012 है'],
    ['hi', 'मेरा फ़ोन नंबर 98765 43210 है'],
    ['en', 'my OTP is 4455'],
    ['en', 'my UPI pin is 2580'],
    ['te', 'నా ఖాతా నంబర్ 123456789012'],
  ] as const)('%s “%s” → sensitive_information', (lang, said) => {
    expect(interpretUtterance(said, lang, savB(lang)).kind).toBe('sensitive_information')
  })
  it('the old bug: "बैंक" in an account-number sentence matched the answer "separately / bank account"', () => {
    expect(matchSpokenAnswer('मेरा बैंक खाता नंबर 123456789012 है', 'hi', savB('hi'))).toMatchObject({ status: 'match', optionId: 'separate' })
  })
  it('mentioning a bank account as the answer is NOT sensitive', () => {
    expect(interpretUtterance('bank account lo separate ga', 'te', savB('te'))).toMatchObject({ kind: 'answer', optionId: 'separate' })
    expect(interpretUtterance('separately, in a bank account', 'en', savB('en'))).toMatchObject({ kind: 'answer', optionId: 'separate' })
  })
})

describe('out of scope: specific financial-product advice and leaving the lesson', () => {
  it.each([
    ['en', 'Should I put my savings in mutual funds instead?'],
    ['en', 'Can you tell me how to get a loan for my shop?'],
    ['hi', 'मुझे बताओ कौन सा सोना खरीदूँ, उसमें फ़ायदा है?'],
    ['hi', 'ye sab chhodo, mujhe loan ke baare mein batao'],
    ['te', 'బంగారం కొనాలా?'],
    // Found by the held-out probe set (SAV-TE-31): "which bank is good?" matched the answer "bank account".
    ['te', 'ఏ బ్యాంక్ మంచిది?'],
    ['hi', 'कौन सा बैंक अच्छा है?'],
    ['en', 'Which bank is best for me?'],
  ] as const)('%s “%s” → out_of_scope (advice)', (lang, said) => {
    expect(interpretUtterance(said, lang, savB(lang))).toMatchObject({ kind: 'out_of_scope', reason: 'advice' })
  })
  it.each([
    ['en', 'What will the weather be tomorrow?'],
    ['hi', 'आज क्रिकेट का स्कोर क्या है?'],
    ['te', 'ఈ రోజు ఏ సినిమా వస్తోంది?'],
  ] as const)('%s “%s” → unrelated', (lang, said) => {
    expect(interpretUtterance(said, lang, yesNo(lang)).kind).toBe('unrelated')
  })
  it.each([
    ['te', 'ఈ పాఠం వద్దు, తర్వాతి పాఠానికి వెళ్దాం'],
    ['en', 'skip this lesson'],
    ['hi', 'ये पाठ छोड़ो, अगला पाठ'],
  ] as const)('%s “%s” → out_of_scope (leave lesson)', (lang, said) => {
    expect(interpretUtterance(said, lang, yesNo(lang))).toMatchObject({ kind: 'out_of_scope', reason: 'leave_lesson' })
  })
  it('a question about the lesson itself is not "unrelated"', () => {
    expect(interpretUtterance('what is profit?', 'en', yesNo('en')).kind).not.toBe('unrelated')
    expect(interpretUtterance('मुनाफ़ा क्या होता है?', 'hi', yesNo('hi')).kind).not.toBe('unrelated')
  })
})

describe('CRITICAL F2: two different amounts are never resolved by picking one (RVP-EN-06)', () => {
  it('“maybe 300, or maybe 1000” → ask which amount', () => {
    const r = interpretUtterance('maybe 300, or maybe 1000', 'en', amounts(300, 1000, 1700))
    expect(r).toMatchObject({ kind: 'ambiguous_amount', amounts: [300, 1000] })
  })
  it.each([
    ['hi', 'शायद तीन सौ या एक हज़ार'],
    ['hi', 'teen sau ya hazaar'],
    ['te', 'మూడు వందలు లేదా వెయ్యి'],
  ] as const)('%s “%s” → ambiguous', (lang, said) => {
    expect(interpretUtterance(said, lang, amounts(300, 1000)).kind).toBe('ambiguous_amount')
  })
  it('the old bug: the first number was proposed', () => {
    expect(matchSpokenAnswer('maybe 300, or maybe 1000', 'en', amounts(300, 1000))).toMatchObject({ status: 'no_match' })
  })
  it('working shown, then a clearly marked result → the result (EXP-HI-05)', () => {
    expect(interpretUtterance('auto ka 40 add karke 440', 'hi', amounts(400, 440))).toMatchObject({ kind: 'answer', optionId: 'o1' })
    expect(interpretUtterance('1000 minus 700 is 300', 'en', amounts(300, 1000, 1700))).toMatchObject({ kind: 'answer', optionId: 'o0' })
  })
})

describe('CRITICAL F3: regional and colloquial amounts (EXP-HI-03, CRD-HI-02, EXP-EN-07)', () => {
  it.each([
    ['hi', 'साढ़े छह सौ', 650],
    ['hi', 'साढ़े चार सौ', 450],
    ['hi', 'saade chhe sau', 650],
    ['hi', 'sadhe char sau', 450],
    ['hi', 'सवा दो सौ', 225],
    ['hi', 'पौने तीन सौ', 275],
    ['hi', 'डेढ़ सौ', 150],
    ['hi', 'साढ़े तीन हज़ार', 3500],
    ['te', 'ఆరున్నర వందలు', 650],
    ['te', 'నాలుగున్నర వందలు', 450],
    ['te', 'రెండున్నర వేలు', 2500],
    ['en', 'two hundred and fifty', 250],
  ] as const)('%s “%s” → %i', (lang, said, v) => {
    expect(parseSpokenAmounts(said, lang)).toMatchObject({ value: v, confidence: 'high' })
  })
  it('the old bug: "साढ़े छह सौ" was read as 600, a different offered option', () => {
    // root cause: "साढ़े" (+½) was not a known word, so only "छह सौ" was counted
    expect(interpretUtterance('साढ़े छह सौ', 'hi', amounts(600, 650))).toMatchObject({ kind: 'answer', optionId: 'o1' })
  })
  it('"six fifty" is low-confidence 650: offered only as "Did you mean ₹650?", never silently', () => {
    expect(parseSpokenAmounts('six fifty', 'en')).toMatchObject({ value: 650, confidence: 'low' })
    expect(interpretUtterance('six fifty', 'en', amounts(600, 650))).toMatchObject({ kind: 'answer', optionId: 'o1', confidence: 'low' })
    // If ₹650 is not a choice, the app asks instead of guessing
    expect(interpretUtterance('six fifty', 'en', amounts(600, 700)).kind).toBe('not_understood')
  })
  it('English words are not read as Hindi numbers on English screens ("do" is not 2)', () => {
    expect(parseSpokenAmounts('what do you mean', 'en').value).toBeNull()
  })
})

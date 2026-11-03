import { describe, expect, it } from 'vitest'
import {
  checkArithmetic,
  checkNumbers,
  checkScript,
  checkShape,
  containsPersonalData,
  extractNumbers,
  guardAiResponse,
  mentionsAdviceTopic,
  revealsAnswer,
  screenLearnerText,
} from '../../../shared/aiGuards.mjs'

describe('numbers', () => {
  it('reads ₹, Indian grouping and Devanagari / Telugu digits', () => {
    expect(extractNumbers('₹1,500 में से ₹१,२०० और ౩౦౦ రూపాయలు').map((n) => [n.value, n.currency])).toEqual([
      [1500, true],
      [1200, true],
      [300, true],
    ])
    expect(extractNumbers('on 3 evenings')).toEqual([{ value: 3, currency: false, index: 3 }])
  })
  it('only approved amounts pass; small counts allowed only when not money', () => {
    expect(checkNumbers('₹500 − ₹300 = ₹200', [200, 300, 500]).ok).toBe(true)
    expect(checkNumbers('On 3 evenings, count your sales.', []).ok).toBe(true)
    expect(checkNumbers('₹3 extra', [])).toMatchObject({ ok: false, code: 'numbers' })
    expect(checkNumbers('₹500 − ₹300 = ₹250', [200, 300, 500])).toMatchObject({ ok: false, code: 'numbers' })
  })
  it('catches wrong arithmetic built from approved amounts', () => {
    expect(checkArithmetic('₹900 − ₹530 = ₹370')).toEqual([{ expression: '900 − 530 = 370', expected: 370, stated: 370, ok: true }])
    expect(checkNumbers('₹500 − ₹300 = ₹130', [130, 300, 500])).toMatchObject({ ok: false, code: 'arithmetic' })
    expect(checkNumbers('₹500 + ₹300 = ₹800', [300, 500, 800]).ok).toBe(true)
    expect(checkNumbers('₹२,००० − ₹१,५०० − ₹१०० = ₹४००', [100, 400, 1500, 2000]).ok).toBe(true)
  })
  it('refuses amounts in words in all three languages', () => {
    for (const t of ['five hundred rupees', 'पाँच सौ रुपये', 'ఐదు వందల రూపాయలు']) expect(checkNumbers(t, [])).toMatchObject({ ok: false, code: 'number_words' })
  })
})

describe('script / language', () => {
  it('English must be Latin only', () => {
    expect(checkScript('Your profit is what is left.', 'en').ok).toBe(true)
    expect(checkScript('Your मुनाफ़ा is left.', 'en').ok).toBe(false)
  })
  it('Hindi: Devanagari, natural English terms allowed, no Telugu', () => {
    expect(checkScript('₹500 आपकी बिक्री (sales) है, profit नहीं।', 'hi').ok).toBe(true)
    expect(checkScript('Aapki bikri 500 hai', 'hi')).toMatchObject({ ok: false, code: 'script' }) // romanized Hindi is not Devanagari
    expect(checkScript('అమ్మకాలు बिक्री', 'hi')).toMatchObject({ ok: false, code: 'script' })
  })
  it('Telugu: Telugu script, natural English terms allowed, no Devanagari', () => {
    expect(checkScript('₹900 అమ్మకాలు (sales); లాభం (profit) కాదు.', 'te').ok).toBe(true)
    expect(checkScript('Sales is money in, profit is what is left', 'te').ok).toBe(false)
    expect(checkScript('बिक्री', 'te').ok).toBe(false)
  })
})

describe('topics and personal data', () => {
  it('lending / investment topics in en, hi, te and romanized', () => {
    for (const t of ['take a loan', 'invest in gold', 'loan lena chahiye', 'byaj kitna', 'कर्ज़ लेना', 'ब्याज', 'లోన్ తీసుకోవాలా', 'వడ్డీ ఎంత']) expect(mentionsAdviceTopic(t), t).toBe(true)
    // Lesson words are not advice topics: stock = goods for sale; udhaar / అప్పు = customer credit.
    for (const t of ['Stock you sold: ₹1,500', 'udhaar sales', 'అప్పుగా ఇచ్చారు', 'a sip of tea']) expect(mentionsAdviceTopic(t), t).toBe(false)
  })
  it('personal data: long numbers and ID/banking words; lesson amounts are not flagged', () => {
    for (const t of ['9876543210', '98765 43210', '1234 5678 9012', 'my OTP is 4455', 'मेरा आधार', 'నా బ్యాంక్ ఖాతా']) expect(containsPersonalData(t), t).toBe(true)
    for (const t of ['₹1,500 and ₹2,000', '2000 1500 100', 'sales 1,00,000', 'spinach']) expect(containsPersonalData(t), t).toBe(false)
  })
  it('screens learner words: private before advice', () => {
    expect(screenLearnerText('loan for 9876543210')).toBe('private')
    expect(screenLearnerText('should I borrow?')).toBe('advice')
    expect(screenLearnerText('I think ₹500')).toBeNull()
  })
})

describe('response shape + guards', () => {
  const ok = { responseType: 'explanation', spokenText: 'Profit is what is left.', displayText: 'Profit is what is left.', conceptId: 'revenue_vs_profit', requiresClarification: false, suggestedNextAction: 'continue' }
  const ctx = { lang: 'en' as const, conceptId: 'revenue_vs_profit', allowed: [200, 300, 500, 800], reveal: { correct: 200, others: [500, 800] } }
  it('shape: exact keys and enums', () => {
    expect(checkShape(ok).ok).toBe(true)
    expect(checkShape({ ...ok, extra: 1 }).ok).toBe(false)
    expect(checkShape({ ...ok, suggestedNextAction: 'skip' }).ok).toBe(false)
    expect(checkShape({ ...ok, displayText: 'x'.repeat(421) }).ok).toBe(false)
    expect(checkShape('{}').ok).toBe(false)
  })
  it('reveal rule: naming only the right amount is refused, listing all choices is fine', () => {
    expect(revealsAnswer('It is ₹200.', ctx.reveal)).toBe(true)
    expect(revealsAnswer('Is it ₹200, ₹500 or ₹800?', ctx.reveal)).toBe(false)
    expect(guardAiResponse({ ...ok, displayText: 'It is ₹200.' }, ctx)).toMatchObject({ ok: false, code: 'reveals_answer' })
  })
  it('spokenText is checked as strictly as displayText', () => {
    expect(guardAiResponse({ ...ok, spokenText: 'You made ₹250.' }, ctx)).toMatchObject({ ok: false, code: 'numbers', detail: expect.stringMatching(/^spokenText/) })
  })
})

// Deterministic guards for AI-generated lesson text and for learner free text.
// Shared by the server (/api/explain) and the browser client (defence in depth), so there is ONE implementation.
// Pure functions, no I/O. Types: ./aiGuards.d.mts
//
// Nothing in here decides whether an answer is right. It only decides whether a piece of generated text
// is safe to show: right script, only approved amounts, correct arithmetic, no advice, no personal data.

const DEVANAGARI_DIGITS = '०१२३४५६७८९'
const TELUGU_DIGITS = '౦౧౨౩౪౫౬౭౮౯'

/** Converts Devanagari and Telugu digits to ASCII so amounts are checked the same way in every script. */
export function normalizeDigits(text) {
  let out = ''
  for (const ch of String(text)) {
    const d = DEVANAGARI_DIGITS.indexOf(ch)
    const t = d < 0 ? TELUGU_DIGITS.indexOf(ch) : -1
    out += d >= 0 ? String(d) : t >= 0 ? String(t) : ch
  }
  return out
}

const RUPEE_BEFORE = /(?:₹|\bRs\.?|\bINR)\s*$/i
const RUPEE_AFTER = /^\s*(?:rupees?|rupaye|rupaiye|रुपये|रुपए|रुपया|रु\.?|రూపాయలు|రూపాయల|రూపాయి|రూ\.?)/i

/**
 * Every number in the text, with whether it is written as money.
 * Handles Indian grouping (1,500 / 1,00,000) and Devanagari / Telugu digits.
 */
export function extractNumbers(text) {
  const s = normalizeDigits(text)
  const out = []
  const re = /\d[\d,]*(?:\.\d+)?/g
  let m
  while ((m = re.exec(s))) {
    const raw = m[0].replace(/,+$/, '')
    const value = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(value)) continue
    const before = s.slice(Math.max(0, m.index - 6), m.index)
    const after = s.slice(m.index + raw.length, m.index + raw.length + 12)
    out.push({ value, currency: RUPEE_BEFORE.test(before) || RUPEE_AFTER.test(after), index: m.index })
  }
  return out
}

/** Arithmetic written as "a − b − c = d" or "a + b = c" (with or without ₹). Returns each statement and whether it is true. */
export function checkArithmetic(text) {
  const s = normalizeDigits(text).replace(/₹\s*/g, '')
  const num = String.raw`\d[\d,]*`
  const re = new RegExp(String.raw`(${num}(?:\s*[+\-−–]\s*${num})+)\s*=\s*(${num})`, 'g')
  const results = []
  let m
  while ((m = re.exec(s))) {
    const tokens = m[1].match(new RegExp(String.raw`[+\-−–]|${num}`, 'g'))
    let total = Number(tokens[0].replace(/,/g, ''))
    for (let i = 1; i < tokens.length; i += 2) {
      const v = Number(tokens[i + 1].replace(/,/g, ''))
      total = tokens[i] === '+' ? total + v : total - v
    }
    const stated = Number(m[2].replace(/,/g, ''))
    results.push({ expression: m[0], expected: total, stated, ok: total === stated })
  }
  return results
}

/**
 * Checks that every number in generated text is one the application validated.
 * - Money amounts must be in `allowed`.
 * - Plain numbers may also be small counts (0–10, e.g. "3 evenings").
 * - Any written arithmetic must be correct.
 * - Number words ("five hundred", "पाँच सौ", "ఐదు వందలు") are refused: amounts must be digits so they can be checked.
 */
export function checkNumbers(text, allowed) {
  const ok = new Set(allowed)
  for (const n of extractNumbers(text)) {
    if (ok.has(n.value)) continue
    if (!n.currency && Number.isInteger(n.value) && n.value >= 0 && n.value <= 10) continue
    return { ok: false, code: 'numbers', detail: `unapproved amount ${n.value}` }
  }
  for (const a of checkArithmetic(text)) if (!a.ok) return { ok: false, code: 'arithmetic', detail: `${a.expression} (expected ${a.expected})` }
  if (NUMBER_WORDS.test(text)) return { ok: false, code: 'number_words', detail: 'amount written in words' }
  return { ok: true }
}
const NUMBER_WORDS = /\b(?:hundred|thousand|lakh|lakhs|crore)\b|सौ|हज़ार|हजार|लाख|करोड़|వంద|వందల|వందలు|వెయ్యి|వేయి|వేల|లక్ష|కోటి/i

/** Letter counts per script (combining marks count with their letters). */
export function scriptProfile(text) {
  let latin = 0
  let devanagari = 0
  let telugu = 0
  for (const ch of String(text)) {
    const c = ch.codePointAt(0)
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) latin++
    else if (c >= 0x0900 && c <= 0x097f) devanagari++
    else if (c >= 0x0c00 && c <= 0x0c7f) telugu++
  }
  return { latin, devanagari, telugu }
}

/**
 * The learner's selected language decides the script:
 * - en: Latin only (no Devanagari or Telugu letters).
 * - hi: Devanagari, no Telugu. English words are allowed (natural code-switching) but at least half the letters must be Devanagari.
 * - te: Telugu script, no Devanagari. Same rule for English words.
 */
export function checkScript(text, lang) {
  const p = scriptProfile(text)
  const letters = p.latin + p.devanagari + p.telugu
  if (letters === 0) return { ok: false, code: 'script', detail: 'no letters' }
  if (lang === 'en') return p.devanagari + p.telugu === 0 ? { ok: true } : { ok: false, code: 'script', detail: 'non-Latin letters in English' }
  const own = lang === 'hi' ? p.devanagari : p.telugu
  const other = lang === 'hi' ? p.telugu : p.devanagari
  if (other > 0) return { ok: false, code: 'script', detail: 'wrong Indic script' }
  if (own / letters < 0.5) return { ok: false, code: 'script', detail: `only ${Math.round((own / letters) * 100)}% ${lang === 'hi' ? 'Devanagari' : 'Telugu'}` }
  return { ok: true }
}

// Lending, investment and other financial-product topics. This lesson never advises on them.
const ADVICE = [
  /\b(?:loans?|borrow\w*|lend\w*|interest rates?|invest\w*|mutual funds?|stock market|share market|shares|crypto\w*|bitcoin|insurance|credit cards?|emi|fixed deposits?|gold loan)\b/i,
  // Specific product picks: gold, chit funds, lotteries (added after eval case SEP-HI-05)
  /\b(?:gold|chit ?funds?|lotter(?:y|ies)|which shares?)\b/i,
  /\b(?:sona|sone)\s+(?:ka|ki|ke|mein|me|kharid\w*|khareed\w*|lena|lun|loon)\b|\bchit ?fund\b/i,
  /(?:सोना|सोने)\s*(?:का|की|के|में|खरीद|ख़रीद|लूँ|लूं|लेना)|चिट ?फंड|लॉटरी/,
  /బంగారం\s*(?:కొన|మీద|లో|తీసుకో)|చిట్టీ|చిట్ ఫండ్|లాటరీ/,
  // "Which bank / scheme / app is best?" — asks for a provider or product recommendation (held-out probe SAV-TE-31)
  /\b(?:which|what)\b[^.?]{0,20}\b(?:bank|scheme|policy|app|fund|plan)s?\b[^.?]{0,20}\b(?:good|best|better|safe|safest|should)\b|\bbest (?:bank|scheme|policy)\b/i,
  /(?:कौन ?सा|कौन ?सी|कौन ?से|किस)\s*[^।?]{0,15}(?:बैंक|योजना|स्कीम|पॉलिसी|ऐप)|\b(?:kaun ?sa|kaun ?si|kaun ?se|kis)\b[^.?]{0,15}\b(?:bank|scheme|yojana|policy|app)\b/i,
  /(?:ఏ|ఏది)\s*[^.?]{0,15}(?:బ్యాంక్|బ్యాంకు|స్కీమ్|పథకం|పాలసీ|యాప్)|(?:బ్యాంక్|బ్యాంకు|స్కీమ్|పథకం)\s*(?:ఏది|ఏ)\s*మంచి/,
  // Named savings products / "should I put money in this scheme?" (held-out v2 probe SAV-HI-42)
  /\b(?:post ?office|recurring deposit|ppf|nsc|sukanya)\b|\b(?:scheme|yojana|pathakam)\s+(?:mein|me|lo)\s+(?:daal|dal|laga|jama|rakh|vey|pett|katt)\w*/i,
  /पोस्ट ?ऑफ़िस|पोस्ट ?ऑफिस|(?:स्कीम|योजना)\s*(?:में|मे)\s*(?:डाल|लगा|जमा|रख)|పోస్ట్ ?ఆఫీస్|(?:స్కీమ్|పథకం)\s*లో\s*(?:వేయ|పెట్ట|కట్ట)/,
  /\b(?:karz|karza|qarz|karj|byaj|byaaj|nivesh|bima|lon)\b/i,
  /लोन|ऋण|कर्ज|क़र्ज़|कर्ज़|ब्याज|निवेश|बीमा|शेयर|म्यूचुअल|क्रेडिट कार्ड|एफडी/,
  /లోన్|రుణ|వడ్డీ|పెట్టుబడి|బీమా|షేర్|మ్యూచువల్|క్రెడిట్ కార్డ్|ఎఫ్‌డీ/,
]
export function mentionsAdviceTopic(text) {
  return ADVICE.some((re) => re.test(text))
}

// Unsupported promises about money.
const CLAIMS = [/\b(?:guarantee\w*|double your|risk[- ]free|sure profit)\b/i, /गारंटी|पक्का मुनाफ़ा|पक्का मुनाफा/, /గ్యారంటీ|ఖచ్చితమైన లాభం/]
export function makesUnsupportedClaim(text) {
  return CLAIMS.some((re) => re.test(text))
}

// Personal / banking data: words that ask for it, or long digit runs that look like it.
const PRIVATE_WORDS = [
  /\b(?:otp|pin|password|passcode|aadhaa?r|pan card|account numbers?|bank account|upi|ifsc|cvv|phone numbers?|mobile numbers?)\b/i,
  /ओटीपी|पिन|पासवर्ड|आधार|पैन कार्ड|खाता संख्या|खाता नंबर|बैंक खाता|यूपीआई|मोबाइल नंबर|फ़ोन नंबर|फोन नंबर/,
  /ఓటీపీ|పిన్|పాస్‌వర్డ్|ఆధార్|పాన్ కార్డ్|ఖాతా నంబర్|బ్యాంక్ ఖాతా|యూపీఐ|ఫోన్ నంబర్|మొబైల్ నంబర్/,
]
/** True if the text contains something that looks like personal or banking data (a long number) or talks about it. */
export function containsPersonalData(text) {
  const s = normalizeDigits(text)
  // Lesson amounts are at most 5 digits. Phone, account and Aadhaar numbers are longer:
  // a 7+ digit run (after removing Indian grouping commas), a 5+5 phone number, or 4-4-4 groups.
  const plain = s.replace(/,(?=\d{2,3}\b)/g, '')
  if (/\d{7,}/.test(plain) || /\d{5}[\s-]\d{5}/.test(plain) || /\d{4}[\s-]\d{4}[\s-]\d{4}/.test(plain)) return true
  return PRIVATE_WORDS.some((re) => re.test(text))
}

// Credentials and ID numbers a learner might say. Unlike PRIVATE_WORDS this does NOT include plain
// "bank account" or "phone number": "keep savings in a bank account" is a valid quiz answer.
const CREDENTIAL_WORDS = [
  /\b(?:otp|pin|password|passcode|cvv|aadhaa?r|pan card|ifsc|upi (?:id|pin)|(?:account|card|khata) (?:number|no)s?)\b/i,
  /ओटीपी|पिन|पासवर्ड|आधार|पैन कार्ड|खाता संख्या|खाता नंबर|खाता नम्बर|कार्ड नंबर|अकाउंट नंबर/,
  /ఓటీపీ|పిన్|పాస్‌వర్డ్|పాస్వర్డ్|ఆధార్|పాన్ కార్డ్|ఖాతా నంబర్|ఖాతా నెంబర్|కార్డ్ నంబర్|అకౌంట్ నంబర్/,
]

/**
 * Sensitive information in what the LEARNER said: a phone / account / ID-length number, or a credential word.
 * Used on every answer screen before matching, so such words are never accepted as an answer or sent anywhere.
 */
export function detectSensitiveInput(text) {
  const s = normalizeDigits(text)
  const plain = s.replace(/,(?=\d{2,3}\b)/g, '')
  if (/\d{7,}/.test(plain) || /\d{5}[\s-]\d{5}/.test(plain) || /\d{4}[\s-]\d{4}[\s-]\d{4}/.test(plain)) return true
  return CREDENTIAL_WORDS.some((re) => re.test(text))
}

/**
 * Pre-check for learner free text before it leaves the device or reaches the model.
 * Returns 'private' | 'advice' | null.
 */
export function screenLearnerText(text) {
  if (detectSensitiveInput(text)) return 'private'
  if (mentionsAdviceTopic(text)) return 'advice'
  return null
}

/**
 * All post-generation checks for one string the learner will see or hear.
 * `allowed` = amounts the application validated for this lesson stage.
 */
export function checkGeneratedText(text, { lang, allowed }) {
  const script = checkScript(text, lang)
  if (!script.ok) return script
  const nums = checkNumbers(text, allowed)
  if (!nums.ok) return nums
  if (mentionsAdviceTopic(text)) return { ok: false, code: 'topic', detail: 'lending/investment topic' }
  if (makesUnsupportedClaim(text)) return { ok: false, code: 'claim', detail: 'unsupported claim' }
  if (PRIVATE_WORDS.some((re) => re.test(text))) return { ok: false, code: 'private', detail: 'mentions personal data' }
  return { ok: true }
}

/**
 * While a question is still open, generated text may list the answer choices but must not single out the
 * right one: if the correct amount appears, every other amount choice must appear too.
 */
export function revealsAnswer(text, rule) {
  if (!rule) return false
  const seen = new Set(extractNumbers(text).map((n) => n.value))
  return seen.has(rule.correct) && !rule.others.every((o) => seen.has(o))
}

const RESPONSE_TYPES = ['explanation', 'clarification', 'encouragement', 'redirect']
const NEXT_ACTIONS = ['continue', 'repeat', 'retry']
export const LIMITS = { displayText: 420, spokenText: 600 }

/** Structural check of a parsed model response (exact keys, enums, types, lengths). */
export function checkShape(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, code: 'schema', detail: 'not an object' }
  const keys = Object.keys(r).sort().join(',')
  if (keys !== 'conceptId,displayText,requiresClarification,responseType,spokenText,suggestedNextAction') return { ok: false, code: 'schema', detail: `keys ${keys}` }
  if (!RESPONSE_TYPES.includes(r.responseType)) return { ok: false, code: 'schema', detail: 'responseType' }
  if (!NEXT_ACTIONS.includes(r.suggestedNextAction)) return { ok: false, code: 'schema', detail: 'suggestedNextAction' }
  if (typeof r.requiresClarification !== 'boolean') return { ok: false, code: 'schema', detail: 'requiresClarification' }
  for (const k of ['displayText', 'spokenText', 'conceptId']) if (typeof r[k] !== 'string' || !r[k].trim()) return { ok: false, code: 'schema', detail: k }
  if (r.displayText.length > LIMITS.displayText || r.spokenText.length > LIMITS.spokenText) return { ok: false, code: 'schema', detail: 'too long' }
  return { ok: true }
}

/**
 * Every content rule for a shape-valid response. ctx = { lang, conceptId, allowed, reveal }.
 * Returns { ok: true } or { ok: false, code, detail }; the caller then uses approved fallback content.
 */
export function guardAiResponse(r, ctx) {
  if (r.conceptId !== ctx.conceptId) return { ok: false, code: 'concept', detail: `conceptId ${r.conceptId}` }
  if (r.requiresClarification !== (r.responseType === 'clarification')) return { ok: false, code: 'inconsistent', detail: 'requiresClarification vs responseType' }
  for (const field of ['displayText', 'spokenText']) {
    const g = checkGeneratedText(r[field], ctx)
    if (!g.ok) return { ...g, detail: `${field}: ${g.detail}` }
    if (revealsAnswer(r[field], ctx.reveal)) return { ok: false, code: 'reveals_answer', detail: field }
  }
  return { ok: true }
}

// Learner-turn intent classification. Deterministic, en/hi/te (+ romanised and code-mixed).
//
// Order matters, and every answer screen (assessment AND lesson) uses this same function:
//   1. sensitive information (account / phone / ID numbers, OTP, PIN …)  → never an answer, never sent anywhere
//   2. out of scope: financial-product advice (loans, investments, gold…) → approved redirect
//   3. clarification request: 'simplify' ("explain simply", "आसान भाषा में", "సులభంగా చెప్పండి", "what does profit mean?")
//      or 'repeat' ("say it again", "समझ नहीं आया", "అర్థం కాలేదు") → replay / explain; NOT an answer
//   4. out of scope: leave the lesson ("skip this lesson")
//   5. uncertainty ("not sure", "पता नहीं") → the "not sure" option (respected, not wrong)
//   6. an answer to the question (option match / amount), incl. ambiguity handling
//   7. unrelated question or command (no amount, no lesson vocabulary)
//   8. not understood
// Steps 1–4 run BEFORE answer matching because those utterances often contain answer words
// ("समझ नहीं आया" contains नहीं = "No"; "मेरा बैंक खाता नंबर…" contains बैंक = "bank account").
// A clarification request is never evidence of comprehension: it produces no answer and no score.
import { detectSensitiveInput, mentionsAdviceTopic } from '../../shared/aiGuards.mjs'
import type { Lang } from '../i18n/strings'
import { matchSpokenAnswer, OPTION_SYNONYMS, type MatchableOption } from './answerMatching'
import { parseSpokenAmounts } from './numbers'
import { isImperativeRequest, isRepeatRequest, isSimplifyRequest, isUnsure, norm } from './phrases'

export type UtteranceIntent =
  | { kind: 'answer'; optionId: string; via: string; confidence: 'high' | 'low'; amount?: number }
  | { kind: 'uncertain' }
  /** 'repeat' = say the question again; 'simplify' = explain it more simply / what does <concept> mean. */
  | { kind: 'clarification_request'; mode: 'repeat' | 'simplify' }
  | { kind: 'sensitive_information' }
  | { kind: 'out_of_scope'; reason: 'advice' | 'leave_lesson' }
  | { kind: 'unrelated' }
  | { kind: 'ambiguous_amount'; amounts: number[] }
  | { kind: 'ambiguous_option' }
  | { kind: 'not_understood'; reason: string }
  | { kind: 'empty' }

const LEAVE: RegExp[] = [
  /\b(skip|stop|leave)\b[^.]{0,12}\b(lesson|question|this)\b|\bnext lesson\b|\bsomething else\b/,
  /(पाठ|सवाल|यह|ये)\s*(छोड़|छोड|रहने दो)|अगला पाठ|कुछ और (सिखा|बता)/,
  /\b(chhodo|chodo|chhod do)\b|\bagla (paath|path|lesson)\b/,
  /(పాఠం|ప్రశ్న)\s*వద్దు|తర్వాతి పాఠ|ఇంకేదైనా\s*(చెప్ప|నేర్ప)/,
  /\b(paatham|patham)\s*vaddu\b/,
]

// Words that show the utterance is about the lesson (sales, profit, money, the stall…).
const LESSON_WORDS =
  /\b(profit|sales?|sell|sold|cost|costs|money|rupees?|cash|credit|udhaar|udhar|saving|savings|expense|stock|shop|stall|business|price|buy|loss|income|earn|pay|customer|box|home|household|vegetables?|tea|grocery|milk|lesson|question|answer|munafa|fayda|faida|nafa|kamai|bikri|kharcha|paisa|paise|bachat|dukaan|galla|labham|ammakalu|kharchu|dabbu|appu)\b|मुनाफ़|मुनाफा|फ़ायद|फायद|नफ़ा|नफा|कमाई|लाभ|बिक्री|बेच|खर्च|पैस|रुपय|रुपए|नकद|उधार|बचत|माल|दुकान|गल्ल|ग्राहक|घर|सब्ज़|सब्ज|चाय|दूध|कीमत|लागत|पाठ|सवाल|जवाब|లాభ|అమ్మ|ఖర్చ|డబ్బ|రూపాయ|నగదు|అప్పు|పొదుపు|సరుకు|దుకాణ|గల్లా|కస్టమర్|ఇల్లు|ఇంటి|కూరగాయ|టీ|పాలు|ధర|పాఠ|ప్రశ్న|జవాబు/

const QUESTION =
  /\?|\b(what|when|where|who|which|how|why|will|can you tell)\b|क्या|कब|कहाँ|कहां|कौन|कैसे|क्यों|\b(kya|kab|kahan|kaun|kaise|kyon)\b|(^|\s)ఏ\s|ఏమి|ఏంటి|ఎప్పుడు|ఎక్కడ|ఎవరు|ఎలా|ఎందుకు|ఏది|\b(emi|enti|eppudu|ekkada|evaru|ela)\b/

const UNSURE_WORDS = (lang: Lang) => [...(OPTION_SYNONYMS.unsure[lang] ?? []), ...(OPTION_SYNONYMS.unsure.en ?? [])]

export function isClarificationRequest(text: string): boolean {
  const t = norm(text)
  const hasAmount = parseSpokenAmounts(text).amounts.some((a) => a >= 10)
  return isSimplifyRequest(t, hasAmount) || isRepeatRequest(t, hasAmount)
}

export function interpretUtterance(transcript: string, lang: Lang, options: MatchableOption[]): UtteranceIntent {
  const raw = transcript.trim()
  if (!raw) return { kind: 'empty' }
  const t = norm(raw)

  if (detectSensitiveInput(raw)) return { kind: 'sensitive_information' }
  if (mentionsAdviceTopic(raw)) return { kind: 'out_of_scope', reason: 'advice' }
  // "एक गाना", "ఒక కథ", "one more time": a lone 'one' is an article, not a rupee amount.
  const hasAmount = parseSpokenAmounts(raw, lang).amounts.some((a) => a >= 10)
  // "Explain it simply" is checked before "say it again": "फिर से आसान भाषा में बताइए" asks for a simpler explanation.
  if (isSimplifyRequest(t, hasAmount)) return { kind: 'clarification_request', mode: 'simplify' }
  if (isRepeatRequest(t, hasAmount)) return { kind: 'clarification_request', mode: 'repeat' }
  if (LEAVE.some((re) => re.test(t))) return { kind: 'out_of_scope', reason: 'leave_lesson' }
  // Before answer matching: "मुझे नहीं पता" / "idea ledu" contain the words for "No".
  if (isUnsure(t) || UNSURE_WORDS(lang).some((p) => t.includes(norm(p)))) {
    return options.some((o) => o.id === 'unsure') ? { kind: 'answer', optionId: 'unsure', via: 'unsure', confidence: 'high' } : { kind: 'uncertain' }
  }

  const m = matchSpokenAnswer(raw, lang, options)
  if (m.status === 'match') return { kind: 'answer', optionId: m.optionId, via: m.via, confidence: m.confidence ?? 'high', ...(m.amount !== undefined ? { amount: m.amount } : {}) }
  if (m.reason === 'ambiguous_amount') return { kind: 'ambiguous_amount', amounts: m.amounts ?? [] }
  if (m.reason === 'ambiguous') return { kind: 'ambiguous_option' }

  // Off-topic: no amount, no lesson vocabulary, and phrased as a question or a command ("tell me a joke").
  if (!hasAmount && !LESSON_WORDS.test(t) && (QUESTION.test(` ${raw.toLowerCase()} `) || isImperativeRequest(t))) return { kind: 'unrelated' }
  // A low-confidence amount that is not one of the choices is not guessed: ask again.
  return { kind: 'not_understood', reason: m.reason }
}

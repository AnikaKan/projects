export type GuardLang = 'en' | 'hi' | 'te'
export type GuardCode = 'script' | 'numbers' | 'arithmetic' | 'number_words' | 'topic' | 'claim' | 'private'
export type GuardResult = { ok: true } | { ok: false; code: GuardCode; detail: string }

export function normalizeDigits(text: string): string
export function extractNumbers(text: string): { value: number; currency: boolean; index: number }[]
export function checkArithmetic(text: string): { expression: string; expected: number; stated: number; ok: boolean }[]
export function checkNumbers(text: string, allowed: readonly number[]): GuardResult
export function scriptProfile(text: string): { latin: number; devanagari: number; telugu: number }
export function checkScript(text: string, lang: GuardLang): GuardResult
export function mentionsAdviceTopic(text: string): boolean
export function makesUnsupportedClaim(text: string): boolean
export function containsPersonalData(text: string): boolean
export function screenLearnerText(text: string): 'private' | 'advice' | null
export function checkGeneratedText(text: string, opts: { lang: GuardLang; allowed: readonly number[] }): GuardResult
export function revealsAnswer(text: string, rule: { correct: number; others: readonly number[] } | null): boolean
export const LIMITS: { displayText: number; spokenText: number }
export type ResponseGuardResult = { ok: true } | { ok: false; code: string; detail: string }
export function checkShape(r: unknown): ResponseGuardResult
export function guardAiResponse(
  r: { responseType: string; spokenText: string; displayText: string; conceptId: string; requiresClarification: boolean; suggestedNextAction: string },
  ctx: { lang: GuardLang; conceptId: string; allowed: readonly number[]; reveal: { correct: number; others: readonly number[] } | null },
): ResponseGuardResult
export function detectSensitiveInput(text: string): boolean

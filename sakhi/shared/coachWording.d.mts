export const COACH_WORDING_MAX: number
export function validateRewrite(source: string, candidate: unknown, opts: { lang: 'en' | 'hi' | 'te'; name?: string }): { ok: true } | { ok: false; code: string }

// Validation for the OPTIONAL AI rewording of a coaching action (Coach View → "Simpler words").
// Shared by the server (before returning) and the browser (before showing). The AI only ever sees ONE approved
// sentence from the playbook; it never sees or writes evidence, reasons or learner history.
import { checkGeneratedText, extractNumbers } from './aiGuards.mjs'

export const COACH_WORDING_MAX = 240

/**
 * A rewrite is accepted only if it: is non-empty and not longer than the source (+20 chars, max 240);
 * uses only the amounts in the source; keeps the learner's name; is in the right script; and passes the
 * advice / claim / personal-data guards. Returns { ok: true } or { ok: false, code }.
 */
export function validateRewrite(source, candidate, { lang, name }) {
  if (typeof candidate !== 'string' || !candidate.trim()) return { ok: false, code: 'empty' }
  const text = candidate.trim()
  if (text.length > Math.min(COACH_WORDING_MAX, source.length + 20)) return { ok: false, code: 'too_long' }
  if (/[\n•*#]/.test(text)) return { ok: false, code: 'format' }
  if (name && !text.includes(name)) return { ok: false, code: 'name_missing' }
  const allowed = extractNumbers(source).map((n) => n.value)
  const g = checkGeneratedText(text, { lang, allowed })
  if (!g.ok) return { ok: false, code: g.code }
  return { ok: true }
}

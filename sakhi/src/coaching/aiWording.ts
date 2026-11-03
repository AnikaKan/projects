// Client for the optional AI rewording of ONE coaching-action sentence (POST /api/coach-wording).
// Without a server key, offline, or on any failure, the approved playbook sentence is shown unchanged.
// The returned text is validated again here before it is displayed.
import type { Lang } from '../i18n/strings'
import { validateRewrite } from '../../shared/coachWording.mjs'

export type WordingResult = { ok: true; text: string } | { ok: false; reason: string }

export async function requestSimplerWording(
  source: string,
  o: { lang: Lang; name: string },
  opts: { fetchImpl?: typeof fetch; endpoint?: string; isOnline?: () => boolean } = {},
): Promise<WordingResult> {
  const online = opts.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false)
  if (!online()) return { ok: false, reason: 'offline' }
  const f = opts.fetchImpl ?? fetch
  try {
    const res = await f(opts.endpoint ?? '/api/coach-wording', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: o.lang, text: source, name: o.name }) })
    const body = (await res.json().catch(() => null)) as { ok?: boolean; text?: string; reason?: string; error?: string } | null
    if (res.status === 503) return { ok: false, reason: 'not_configured' }
    if (!res.ok || !body?.ok || typeof body.text !== 'string') return { ok: false, reason: body?.reason ?? body?.error ?? 'unavailable' }
    const v = validateRewrite(source, body.text, { lang: o.lang, name: o.name })
    return v.ok ? { ok: true, text: body.text.trim() } : { ok: false, reason: `client_guard:${v.code}` }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

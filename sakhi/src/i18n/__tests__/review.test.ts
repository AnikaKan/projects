import { afterEach, describe, expect, it } from 'vitest'
import { buildOverrides, collectEntries, parseCsv, toCsv } from '../review'
import { setOverridesForTest } from '../overrides'
import { translate } from '../strings'
import { at } from '../../assessment/i18n'
import { text } from '../../learning/render'
import { REVENUE_VS_PROFIT } from '../../learning/content/revenueVsProfit'

let restore: (() => void) | null = null
afterEach(() => restore?.())

describe('translation review workflow', () => {
  it('exports every UI, assessment and lesson string, and the CSV round-trips (commas, quotes, scripts)', () => {
    const rows = collectEntries()
    expect(rows.some((r) => r.namespace === 'ui' && r.key === 'stt.err.language')).toBe(true)
    expect(rows.some((r) => r.namespace === 'assessment')).toBe(true)
    expect(rows.some((r) => r.namespace === 'lesson.revenue_vs_profit' && r.key === 'intro.0')).toBe(true)
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('accepts a reviewed change and rejects ones that would break the app', () => {
    const base = collectEntries()
    const edited = base.map((r) => {
      if (r.namespace === 'lesson.revenue_vs_profit' && r.key === 'h.check') return { ...r, te: 'త్వరగా చూద్దాం' }
      if (r.namespace === 'lesson.revenue_vs_profit' && r.key === 'fb.response.correct') return { ...r, hi: 'सही! मुनाफ़ा {left} है।' } // drops {sales} {goodsCost}
      if (r.namespace === 'ui' && r.key === 'tts.slow') return { ...r, hi: '₹10 धीरे' }
      if (r.namespace === 'ui' && r.key === 'stt.retry') return { ...r, te: '' }
      return r
    })
    const res = buildOverrides(edited, base)
    expect(res.changed).toBe(1)
    expect(res.overrides).toEqual({ 'lesson.revenue_vs_profit': { te: { 'h.check': 'త్వరగా చూద్దాం' } } })
    expect(res.rejected.map((r) => `${r.key}:${r.reason}`).sort()).toEqual(['fb.response.correct:slots must be {goodsCost,left,sales}', 'stt.retry:empty', 'tts.slow:amounts must not be typed in translations'])
  })

  it('overrides take effect everywhere text is shown or spoken', () => {
    restore = setOverridesForTest({
      ui: { hi: { 'tts.slow': 'आराम से' } },
      assessment: { te: { 'opt.unsure': 'నాకు తెలియదు' } },
      'lesson.revenue_vs_profit': { te: { 'h.check': 'త్వరగా చూద్దాం' } },
    })
    expect(translate('hi', 'tts.slow')).toBe('आराम से')
    expect(at('te', 'opt.unsure')).toBe('నాకు తెలియదు')
    expect(text(REVENUE_VS_PROFIT, 'te', 'vegetable', 'h.check')).toBe('త్వరగా చూద్దాం')
    expect(translate('en', 'tts.slow')).toBe('Slow') // English untouched
  })
})

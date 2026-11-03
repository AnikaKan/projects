import { describe, expect, it } from 'vitest'
import { REVENUE_VS_PROFIT as C } from '../content/revenueVsProfit'
import { exampleBars, hasText, renderFeedback, renderQuestion, text, valuesFor } from '../render'
import { initialState, replay } from '../machine'
import { STEPS, type QuestionId } from '../types'
import type { Lang } from '../../i18n/strings'
import type { Business } from '../../lib/calc'

const LANGS: Lang[] = ['en', 'hi', 'te']
const BIZ: Business[] = ['vegetable', 'tea', 'grocery']
const QS: QuestionId[] = ['response', 'practice', 'check']
const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
const amounts = (s: string) => [...s.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')))

describe('lesson text', () => {
  it('Hindi and Telugu have every key English has (text, UI, step labels)', () => {
    for (const lang of ['hi', 'te'] as const) {
      expect(Object.keys(C.text[lang].t).sort()).toEqual(Object.keys(C.text.en.t).sort())
      expect(Object.keys(C.text[lang].ui).sort()).toEqual(Object.keys(C.text.en.ui).sort())
      expect(Object.keys(C.text[lang].stepLabels).sort()).toEqual([...STEPS].sort())
    }
  })

  it('every template has the same {slots} in all languages', () => {
    for (const k of Object.keys(C.text.en.t)) for (const l of ['hi', 'te'] as const) expect(slots(C.text[l].t[k]), `${l} ${k}`).toEqual(slots(C.text.en.t[k]))
  })

  it('no amount is written into the text (numbers come only from scenarios)', () => {
    for (const l of LANGS) for (const [k, v] of Object.entries(C.text[l].t)) expect(/₹|\d{2,}/.test(v), `${l} ${k}`).toBe(false)
  })

  it('explanations stay short (≤ 2 short sentences ≈ 220 characters)', () => {
    for (const l of LANGS) for (const [k, v] of Object.entries(C.text[l].t)) expect(v.length, `${l} ${k}`).toBeLessThanOrEqual(220)
  })

  it('business-specific variants exist for every business where used', () => {
    for (const b of BIZ)
      for (const k of ['intro.1', 'example.0', 'example.1', 'example.more', 'bar.goods', 'response.q', 'practice.q', 'challenge'])
        for (const l of LANGS) expect(hasText(C, l, b, k), `${l} ${b} ${k}`).toBe(true)
  })
})

describe('personalisation vocabulary (English source)', () => {
  const all = (b: Business) => ['example.0', 'example.more', 'practice.q', 'challenge', 'intro.1'].map((k) => text(C, 'en', b, k, valuesFor(C, b, 'example'))).join(' ')
  it('vegetable seller: sales, mandi vegetables, spoilage, transport', () => {
    expect(all('vegetable')).toMatch(/mandi/)
    expect(all('vegetable')).toMatch(/[Ss]poiled/)
    expect(all('vegetable')).toMatch(/auto/)
  })
  it('tea stall: tea sales, milk, ingredients, gas (fuel)', () => {
    expect(all('tea')).toMatch(/tea/)
    expect(all('tea')).toMatch(/milk/)
    expect(all('tea')).toMatch(/sugar/)
    expect(all('tea')).toMatch(/[Gg]as/)
  })
  it('grocery store: stock, daily sales, customer credit (udhaar)', () => {
    const g = all('grocery') + text(C, 'en', 'grocery', 'example.note', valuesFor(C, 'grocery', 'example'))
    expect(g).toMatch(/stock/)
    expect(g).toMatch(/sales/)
    expect(g).toMatch(/udhaar/)
  })
})

describe('identical values and answers across languages', () => {
  for (const b of BIZ)
    for (const q of QS)
      it(`${b} · ${q}`, () => {
        const r = LANGS.map((l) => renderQuestion(C, q, b, l))
        for (const x of r) {
          expect(x.stem).not.toMatch(/[{}]/)
          expect(amounts(x.stem).sort()).toEqual(amounts(r[0].stem).sort())
          expect(x.options.map((o) => [o.id, o.amount])).toEqual(r[0].options.map((o) => [o.id, o.amount]))
        }
        // exactly one correct option, distinct amounts
        expect(C.questions[q].options.filter((o) => o.outcome.kind === 'correct')).toHaveLength(1)
        const shown = r[0].options.filter((o) => o.amount !== undefined).map((o) => o.amount)
        expect(new Set(shown).size).toBe(shown.length)
      })

  it('feedback for every option shows the same amounts in every language', () => {
    for (const b of BIZ) {
      const toResponse = [{ type: 'NEXT' as const }, { type: 'NEXT' as const }, { type: 'NEXT' as const }]
      for (const q of QS)
        for (const o of C.questions[q].options) {
          const prefix = q === 'response' ? [] : q === 'practice' ? [{ type: 'ANSWER' as const, optionId: 'left' }, { type: 'NEXT' as const }] : [{ type: 'ANSWER' as const, optionId: 'left' }, { type: 'NEXT' as const }, { type: 'ANSWER' as const, optionId: 'profit' }, { type: 'NEXT' as const }]
          const s = replay(initialState({ content: C, business: b, now: 't' }), [...toResponse, ...prefix, { type: 'ANSWER', optionId: o.id }], C)
          const fbs = LANGS.map((l) => renderFeedback(C, s, q, l)!)
          for (const f of fbs) {
            expect(f.message).not.toMatch(/[{}]/)
            expect(amounts(f.message).sort()).toEqual(amounts(fbs[0].message).sort())
            expect(f.tone).toBe(o.outcome.kind === 'correct' ? 'positive' : 'corrective')
          }
        }
    }
  })

  it('PRD demo text: ₹500 sales, ₹300 vegetables, ₹200 left — in all three languages', () => {
    for (const l of LANGS) {
      const ex = text(C, l, 'vegetable', 'example.0', valuesFor(C, 'vegetable', 'example'))
      expect(amounts(ex)).toEqual([500, 300, 200])
    }
  })

  it('amount bars add up to sales', () => {
    for (const b of BIZ)
      for (const l of LANGS) {
        const bars = exampleBars(C, b, l)
        expect(bars.first.reduce((a, s) => a + s.amount, 0)).toBe(bars.sales)
        expect(bars.second.reduce((a, s) => a + s.amount, 0)).toBe(bars.sales)
      }
  })

  it('corrective feedback never uses blaming words', () => {
    for (const l of LANGS) for (const [k, v] of Object.entries(C.text[l].t)) if (k.startsWith('fb.')) expect(v, k).not.toMatch(/\b(wrong|incorrect|mistake|failed)\b|गलत|తప్పు/i)
  })
})

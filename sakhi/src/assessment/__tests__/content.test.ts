// Content integrity and cross-language consistency.
import { describe, expect, it } from 'vitest'
import { ITEM_BANK, ITEMS_BY_ID, LESSON_CATALOG, MISCONCEPTION_TAXONOMY } from '../bank'
import { currentItemId, finalize, itemValues, renderQuestion, startAssessment, submitAnswer } from '../engine'
import { A_DICTS } from '../i18n'
import { CONCEPTS, MISCONCEPTIONS } from '../types'
import type { Lang } from '../../i18n/strings'
import type { Business } from '../../lib/calc'

const LANGS: Lang[] = ['en', 'hi', 'te']
const BUSINESSES: Business[] = ['vegetable', 'tea', 'grocery']
const slots = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort()
const amounts = (s: string) => [...s.matchAll(/₹([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ''))).sort((a, b) => a - b)

describe('translations', () => {
  it('Hindi and Telugu have exactly the same keys as English', () => {
    const en = Object.keys(A_DICTS.en).sort()
    expect(Object.keys(A_DICTS.hi).sort()).toEqual(en)
    expect(Object.keys(A_DICTS.te).sort()).toEqual(en)
  })

  it('every template uses the same set of {slots} in all three languages', () => {
    for (const k of Object.keys(A_DICTS.en) as (keyof typeof A_DICTS.en)[]) {
      expect(slots(A_DICTS.hi[k]), `hi ${k}`).toEqual(slots(A_DICTS.en[k]))
      expect(slots(A_DICTS.te[k]), `te ${k}`).toEqual(slots(A_DICTS.en[k]))
    }
  })

  it('no translation contains a hard-coded amount (numbers come only from the bank)', () => {
    for (const lang of LANGS) for (const [k, v] of Object.entries(A_DICTS[lang])) expect(/₹|\d{2,}/.test(v), `${lang} ${k}`).toBe(false)
  })
})

describe('rendering is identical in numbers across languages', () => {
  for (const item of ITEM_BANK)
    for (const business of BUSINESSES)
      it(`${item.id} · ${business}`, () => {
        const r = LANGS.map((l) => renderQuestion(item.id, business, l))
        for (const q of r) {
          expect(q.stem).not.toMatch(/[{}]/)
          expect(q.explanation).not.toMatch(/[{}]/)
          for (const o of q.options) expect(o.label).not.toMatch(/[{}]/)
        }
        // same option ids, same order, same amounts
        expect(r[1].options.map((o) => [o.id, o.amount])).toEqual(r[0].options.map((o) => [o.id, o.amount]))
        expect(r[2].options.map((o) => [o.id, o.amount])).toEqual(r[0].options.map((o) => [o.id, o.amount]))
        // the same ₹ amounts appear in the question and the explanation in every language
        expect(amounts(r[1].stem)).toEqual(amounts(r[0].stem))
        expect(amounts(r[2].stem)).toEqual(amounts(r[0].stem))
        expect(amounts(r[1].explanation)).toEqual(amounts(r[0].explanation))
        expect(amounts(r[2].explanation)).toEqual(amounts(r[0].explanation))
        expect(r[0].values).toEqual(itemValues(item, business))
      })
})

describe('scoring is identical across languages', () => {
  // Every combination of business × language × answer pattern must produce the same result.
  const patterns: Record<string, (itemId: string) => string> = {
    allCorrect: (id) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'correct')!.id,
    allMisconception: (id) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'misconception')!.id,
    allUnsure: () => 'unsure',
    mixed: (id) => ITEMS_BY_ID[id].options[ITEMS_BY_ID[id].id.length % ITEMS_BY_ID[id].options.length].id,
  }
  for (const business of BUSINESSES)
    for (const [name, pick] of Object.entries(patterns))
      for (const attempt of [1, 2])
        it(`${business} · ${name} · attempt ${attempt}`, () => {
          const results = LANGS.map((lang) => {
            let s = startAssessment({ learnerId: 'L', business, attempt, now: 't', id: 'x' })
            for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: pick(id), source: 'tap', lang, answeredAt: 't' }).session
            const r = finalize(s, { now: 't' })
            return { ...r, answers: r.answers.map(({ lang: _l, ...a }) => a) }
          })
          expect(results[1]).toEqual(results[0])
          expect(results[2]).toEqual(results[0])
        })
})

describe('item bank quality rules', () => {
  it('each item has exactly one correct option and an "I’m not sure" option', () => {
    for (const i of ITEM_BANK) {
      expect(i.options.filter((o) => o.outcome.kind === 'correct'), i.id).toHaveLength(1)
      expect(i.options.some((o) => o.id === 'unsure' && o.outcome.kind === 'unsure'), i.id).toBe(true)
    }
  })

  it('amount options are distinct (no two options show the same number)', () => {
    for (const i of ITEM_BANK)
      for (const b of BUSINESSES) {
        const v = itemValues(i, b)
        const shown = i.options.filter((o) => o.amountOf).map((o) => v[o.amountOf!])
        expect(new Set(shown).size, `${i.id} ${b}`).toBe(shown.length)
      }
  })

  it('all amounts are small, positive whole-rupee fictional values', () => {
    for (const i of ITEM_BANK)
      for (const b of BUSINESSES)
        for (const [k, v] of Object.entries(itemValues(i, b))) {
          expect(Number.isInteger(v), `${i.id} ${b} ${k}`).toBe(true)
          expect(v, `${i.id} ${b} ${k}`).toBeGreaterThan(0)
          expect(v, `${i.id} ${b} ${k}`).toBeLessThan(10000)
        }
  })

  it('every concept has two approved parallel forms (A and B)', () => {
    for (const c of CONCEPTS) {
      const forms = ITEM_BANK.filter((i) => i.concept === c && i.status === 'approved').map((i) => i.form).sort()
      expect(forms, c).toEqual(['A', 'B'])
    }
  })

  it('every misconception code is used by an item, has a concept and maps to an approved lesson', () => {
    const used = new Set(ITEM_BANK.flatMap((i) => i.options.flatMap((o) => (o.outcome.kind === 'misconception' ? [o.outcome.code] : []))))
    for (const m of MISCONCEPTIONS) {
      expect(used.has(m), m).toBe(true)
      const lesson = LESSON_CATALOG.find((l) => l.id === MISCONCEPTION_TAXONOMY[m].lesson)
      expect(lesson?.status, m).toBe('approved')
    }
  })

  it('every misconception option belongs to its item’s concept', () => {
    for (const i of ITEM_BANK)
      for (const o of i.options) if (o.outcome.kind === 'misconception') expect(MISCONCEPTION_TAXONOMY[o.outcome.code].concept).toBe(i.concept)
  })
})

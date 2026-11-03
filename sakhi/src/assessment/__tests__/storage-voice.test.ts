import { describe, expect, it } from 'vitest'
import { ITEMS_BY_ID } from '../bank'
import { renderQuestion, scoreAnswer, startAssessment, submitAnswer, finalize, currentItemId } from '../engine'
import { loadRecord, MemoryStore, nextAttemptNumber, saveRecord, storageKey } from '../storage'
import { parseAmount, resolveSpokenAnswer } from '../voice'

const NOW = '2026-10-28T10:00:00.000Z'
const correctOf = (id: string) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'correct')!.id

describe('local storage', () => {
  it('saves and resumes an in-progress assessment at the right question', () => {
    const store = new MemoryStore()
    let s = startAssessment({ learnerId: 'L1', business: 'tea', attempt: 1, now: NOW })
    for (const id of s.itemIds.slice(0, 2)) s = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: 'hi', answeredAt: NOW }).session
    saveRecord(store, 'L1', { schemaVersion: 1, inProgress: s, results: [] })

    const loaded = loadRecord(store, 'L1')
    expect(loaded.inProgress?.answers).toHaveLength(2)
    expect(currentItemId(loaded.inProgress!)).toBe(s.itemIds[2])
  })

  it('keeps learners separate', () => {
    const store = new MemoryStore()
    saveRecord(store, 'A', { schemaVersion: 1, inProgress: startAssessment({ learnerId: 'A', business: 'tea', attempt: 1, now: NOW }), results: [] })
    expect(loadRecord(store, 'B').inProgress).toBeNull()
  })

  it('recovers from corrupted or outdated data without crashing', () => {
    const store = new MemoryStore()
    store.setItem(storageKey('L1'), '{not json')
    expect(loadRecord(store, 'L1')).toEqual({ schemaVersion: 1, inProgress: null, results: [] })
    store.setItem(storageKey('L1'), JSON.stringify({ schemaVersion: 0, inProgress: null, results: [] }))
    expect(loadRecord(store, 'L1').results).toEqual([])
    const bad = { ...startAssessment({ learnerId: 'L1', business: 'tea', attempt: 1, now: NOW }), itemIds: ['deleted_item'] }
    store.setItem(storageKey('L1'), JSON.stringify({ schemaVersion: 1, inProgress: bad, results: [] }))
    expect(loadRecord(store, 'L1').inProgress).toBeNull()
  })

  it('restarting after a completed attempt increments the attempt number; an intermediate learner re-checks with applied questions', () => {
    let s = startAssessment({ learnerId: 'L1', business: 'grocery', attempt: 1, now: NOW })
    for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: correctOf(id), source: 'tap', lang: 'en', answeredAt: NOW }).session
    const rec = { schemaVersion: 1 as const, inProgress: null, results: [finalize(s, { now: NOW })] }
    expect(nextAttemptNumber(rec)).toBe(2)
    expect(rec.results[0].tier).toBe('intermediate')
    const retry = startAssessment({ learnerId: 'L1', business: 'grocery', attempt: nextAttemptNumber(rec), now: NOW, mode: 'applied' })
    expect(retry.itemIds).toHaveLength(5)
    expect(retry.itemIds.every((id) => ITEMS_BY_ID[id].form === 'B')).toBe(true)
    expect(retry.itemIds.filter((id) => !s.itemIds.includes(id)).length).toBeGreaterThanOrEqual(2) // credit + saving applied questions are new
  })

  it('works when storage throws (e.g. private mode / quota)', () => {
    const throwing = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('full') }, removeItem: () => {} }
    expect(() => saveRecord(throwing, 'L1', { schemaVersion: 1, inProgress: null, results: [] })).not.toThrow()
    expect(loadRecord(throwing, 'L1').inProgress).toBeNull()
  })
})

describe('voice-answer preparation (deterministic resolver)', () => {
  const yesNo = (lang: 'en' | 'hi' | 'te') => renderQuestion('crd_a_credit_is_cash', 'grocery', lang)

  it.each([
    ['en', 'No', 'no'],
    ['en', 'yes it is', 'yes'],
    ['hi', 'नहीं', 'no'],
    ['hi', 'haan', 'yes'],
    ['te', 'లేదు', 'no'],
    ['te', 'అవును', 'yes'],
    ['te', 'teliyadu', 'unsure'],
    ['hi', 'पता नहीं', 'unsure'],
  ] as const)('%s “%s” → %s', (lang, transcript, expected) => {
    const r = resolveSpokenAnswer(yesNo(lang), { transcript, lang, confidence: 0.9 })
    expect(r).toMatchObject({ status: 'match', optionId: expected, needsConfirmation: true })
  })

  it('maps a spoken amount to the matching option in any language', () => {
    for (const lang of ['en', 'hi', 'te'] as const) {
      const q = renderQuestion('rvp_b_find_profit', 'vegetable', lang)
      expect(resolveSpokenAnswer(q, { transcript: '₹300', lang, confidence: 0.8 })).toMatchObject({ optionId: 'profit' })
      expect(resolveSpokenAnswer(q, { transcript: '1,000 rupees', lang, confidence: 0.8 })).toMatchObject({ optionId: 'sales' })
    }
    expect(parseAmount('one thousand')).toBeNull()
  })

  it('returns no_match for low confidence, contradictions and unknown amounts (UI falls back to tap)', () => {
    const q = yesNo('en')
    expect(resolveSpokenAnswer(q, { transcript: 'yes', lang: 'en', confidence: 0.3 }).status).toBe('no_match')
    expect(resolveSpokenAnswer(q, { transcript: 'yes no', lang: 'en', confidence: 0.9 }).status).toBe('no_match')
    const amt = renderQuestion('rvp_b_find_profit', 'vegetable', 'en')
    expect(resolveSpokenAnswer(amt, { transcript: '450', lang: 'en', confidence: 0.9 }).status).toBe('no_match')
  })

  it('a voice answer and a tap answer of the same option score identically', () => {
    const q = yesNo('te')
    const r = resolveSpokenAnswer(q, { transcript: 'అవును', lang: 'te', confidence: 0.9 })
    expect(r.status).toBe('match')
    const viaVoice = scoreAnswer(q.itemId, (r as { optionId: string }).optionId)
    const viaTap = scoreAnswer(q.itemId, 'yes')
    expect(viaVoice).toEqual(viaTap)
  })
})

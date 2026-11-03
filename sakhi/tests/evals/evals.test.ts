// CI gate for the evaluation framework. Runs the deterministic layer only (no network).
// It does NOT require every eval case to pass: documented open findings live in known-failures.ts.
// It fails on dataset errors, calculation/consistency errors, invalid responses, and NEW eval failures.
import { describe, expect, it } from 'vitest'
import { CATEGORIES, CONCEPTS, LANGS } from './lib/schema'
import { evaluate, loadDataset } from './lib/evaluate'
import { financialSweep, languageSweep } from './lib/metrics'
import { KNOWN_FAILURES } from './known-failures'
import { loadConsistency, runConsistency, VARIETIES } from './lib/consistency'

const ds = loadDataset()
const report = evaluate(ds)

describe('evaluation dataset', () => {
  it('is valid against the schema and has at least 45 fictional cases', () => {
    expect(ds.cases.length).toBeGreaterThanOrEqual(45)
  })
  it('the held-out probe set is valid too (its results are reported, not gated)', () => {
    for (const v of ['v1', 'v2', 'v3', 'v4']) expect(loadDataset(new URL(`./dataset/holdout.${v}.json`, import.meta.url)).cases.length, v).toBeGreaterThan(0)
  })
  it('covers every concept in every language, and every required category', () => {
    for (const c of CONCEPTS) for (const l of LANGS) expect(ds.cases.some((x) => x.concept === c && x.language === l), `${c}/${l}`).toBe(true)
    for (const cat of CATEGORIES) expect(ds.cases.some((x) => x.category === cat), cat).toBe(true)
    expect(ds.cases.filter((x) => x.category === 'code_mixed_hi_en').length).toBeGreaterThanOrEqual(3)
    expect(ds.cases.filter((x) => x.category === 'code_mixed_te_en').length).toBeGreaterThanOrEqual(3)
  })
  it('never claims native-speaker review without a named reviewer', () => {
    for (const c of ds.cases) if (c.translation?.status === 'reviewed') expect(c.translation.reviewer, c.id).toBeTruthy()
    expect(ds.cases.filter((c) => c.translation?.status === 'reviewed')).toHaveLength(0) // none reviewed yet
  })
})

describe('deterministic functionality', () => {
  it('every calculation matches the hand-computed reference table, in every language rendering', () => {
    const bad = financialSweep().filter((r) => r.status !== 'pass')
    expect(bad).toEqual([])
  })
  it('every language version of every question shows the same numbers', () => {
    expect(languageSweep().filter((r) => r.status !== 'pass')).toEqual([])
  })
  it('every learner-facing response the pipeline produces is schema-valid, in the right script and grounded', () => {
    for (const c of report.cases) {
      expect(c.responseChecks.schema.status, c.id).toBe('pass')
      expect(c.responseChecks.languageScript.status, c.id).toBe('pass')
      expect(c.responseChecks.grounding.status, c.id).toBe('pass')
    }
  })
  it('no learner words with personal data or advice requests would be sent to the model', () => {
    for (const c of report.cases) expect(c.critical.filter((x) => x === 'PRIVATE_DATA_SENT' || x === 'ADVICE_NOT_REDIRECTED'), c.id).toEqual([])
  })
})

describe('regression gate', () => {
  const failed = report.cases.filter((c) => !c.pass).map((c) => c.id)
  it('no new failing cases beyond the documented baseline', () => {
    expect(failed.filter((id) => !KNOWN_FAILURES[id])).toEqual([])
  })
  it('baseline entries still exist in the dataset', () => {
    for (const id of Object.keys(KNOWN_FAILURES)) expect(ds.cases.some((c) => c.id === id), id).toBe(true)
  })
})

describe('language consistency (equivalent en / hi / te utterances get equivalent results)', () => {
  const cds = loadConsistency()
  const cr = runConsistency(cds)
  it('covers every concept, every language variety and every intent category', () => {
    for (const c of CONCEPTS) expect(cds.groups.some((g) => g.concept === c), c).toBe(true)
    for (const g of cds.groups) expect(g.variants.map((v) => v.variety).sort(), g.id).toEqual([...VARIETIES].sort())
    for (const cat of ['correct', 'incorrect', 'unsure', 'repeat', 'simplify', 'unrelated']) expect(cds.groups.some((g) => g.category === cat), cat).toBe(true)
  })
  it('no utterance in any language variety has a critical failure (scored non-answer, false correct, …)', () => {
    expect(cr.summary.critical).toEqual([])
  })
  it('every group gets the same result in every variety', () => {
    expect(cr.groups.filter((g) => !g.allPass).map((g) => `${g.id}: ${g.failing.join(',')}`)).toEqual([])
  })
})

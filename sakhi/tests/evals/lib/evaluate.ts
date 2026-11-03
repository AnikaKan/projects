// Runs the whole evaluation in-process and returns a plain JSON report. Used by the CLI runner and by vitest.
import { readFileSync } from 'node:fs'
import { DatasetSchema, type Dataset, type EvalCase } from './schema'
import { runCase, type SystemResult } from './pipeline'
import { caseChecks, financialSweep, languageSweep, responseChecks, synonymCoverage, type Check, type SweepRow } from './metrics'

export const DATASET_PATH = new URL('../dataset/cases.v1.json', import.meta.url)

export function loadDataset(path: URL = DATASET_PATH): Dataset {
  return DatasetSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
}

export interface CaseReport {
  id: string
  language: string
  business: string
  concept: string
  category: string
  input: string
  system: Omit<SystemResult, 'response'> & { responseText: string }
  checks: Record<string, Check>
  responseChecks: Record<string, Check>
  critical: string[]
  warnings: string[]
  /** All deterministic checks pass (pending checks excluded) and no critical failure. */
  pass: boolean
  pending: string[]
  translationReview: string | null
}

const rate = (pass: number, total: number) => ({ pass, total, rate: total ? Math.round((pass / total) * 1000) / 10 : null })

export function evaluate(ds: Dataset = loadDataset()) {
  const cases: CaseReport[] = ds.cases.map((c: EvalCase) => {
    const r = runCase(c)
    const { checks, critical, warnings } = caseChecks(c, r)
    const rc = responseChecks(c, r)
    const pending = Object.entries(checks)
      .filter(([, v]) => v.status === 'pending')
      .map(([k]) => k)
    const pass = Object.values(checks).every((v) => v.status !== 'fail') && critical.length === 0
    const { response, ...sys } = r
    return {
      id: c.id,
      language: c.language,
      business: c.business,
      concept: c.concept,
      category: c.category,
      input: `${c.input.mode}: ${c.input.value}`,
      system: { ...sys, responseText: response.displayText },
      checks,
      responseChecks: rc,
      critical,
      warnings,
      pass,
      pending,
      translationReview: c.translation ? `${c.translation.status} (${c.translation.confidence})` : null,
    }
  })

  const byCase = new Map(ds.cases.map((c) => [c.id, c]))
  const metricOf = (key: string, filter: (c: CaseReport) => boolean = () => true) => {
    const rel = cases.filter(filter).filter((c) => c.checks[key] && c.checks[key].status !== 'n/a' && c.checks[key].status !== 'pending')
    return rate(rel.filter((c) => c.checks[key].status === 'pass').length, rel.length)
  }
  const respMetric = (key: string) => {
    const rel = cases.filter((c) => c.responseChecks[key].status !== 'n/a')
    return rate(rel.filter((c) => c.responseChecks[key].status === 'pass').length, rel.length)
  }

  // Reference-based
  const expectedCorrect = cases.filter((c) => byCase.get(c.id)!.expected.correctness === 'correct')
  const systemCorrect = cases.filter((c) => c.system.correctness === 'correct')
  const expectedMis = cases.filter((c) => {
    const e = byCase.get(c.id)!.expected.classification
    return (Array.isArray(e) ? e : [e]).some((x) => x.startsWith('misconception_'))
  })
  const fin = financialSweep()
  const lang = languageSweep()
  const groups = new Map<string, CaseReport[]>()
  for (const c of ds.cases) if (c.consistencyGroup) groups.set(c.consistencyGroup, [...(groups.get(c.consistencyGroup) ?? []), cases.find((x) => x.id === c.id)!])
  const groupRows = [...groups].map(([g, members]) => {
    const sig = members.map((m) => JSON.stringify([m.system.classification, m.system.correctness, m.system.nextAction, m.system.parsedAmount ?? null]))
    const same = new Set(sig).size === 1
    return { group: g, members: members.map((m) => m.id), consistent: same, outcomes: Object.fromEntries(members.map((m, i) => [m.id, JSON.parse(sig[i])])) }
  })
  const sweepRate = (rows: SweepRow[]) => rate(rows.filter((r) => r.status === 'pass').length, rows.length)

  const referenceBased = {
    financialCalculationAccuracy: {
      referenceTable: sweepRate(fin),
      spokenAmountParsing: metricOf('amount'),
    },
    correctAnswerClassification: {
      recall: rate(expectedCorrect.filter((c) => c.system.correctness === 'correct').length, expectedCorrect.length),
      precision: rate(systemCorrect.filter((c) => byCase.get(c.id)!.expected.correctness === 'correct').length, systemCorrect.length),
    },
    misconceptionDetection: rate(expectedMis.filter((c) => c.checks.classification.status === 'pass').length, expectedMis.length),
    classificationOverall: metricOf('classification'),
    routing: metricOf('route'),
    lessonProgressionCorrectness: metricOf('nextAction'),
    responseSchemaValidity: respMetric('schema'),
    crossLanguageConsistency: {
      contentSweep: sweepRate(lang),
      caseGroups: rate(groupRows.filter((g) => g.consistent).length, groupRows.length),
    },
  }
  const referenceFreeProxies = Object.fromEntries(['clarity', 'tone', 'grounding', 'languageScript', 'length', 'correctiveHelpfulness'].map((k) => [k, respMetric(k)]))

  const breakdown = (key: 'language' | 'category' | 'concept') =>
    Object.fromEntries([...new Set(cases.map((c) => c[key]))].map((v) => [v, rate(cases.filter((c) => c[key] === v && c.pass).length, cases.filter((c) => c[key] === v).length)]))

  return {
    dataset: { name: ds.name, version: ds.version, cases: ds.cases.length },
    summary: {
      casesPassed: rate(cases.filter((c) => c.pass).length, cases.length),
      /** Passed every deterministic check, but the final intent label still needs a live AI run. */
      casesPassedWithPending: cases.filter((c) => c.pass && c.pending.length).length,
      casesFullyPassed: rate(cases.filter((c) => c.pass && !c.pending.length).length, cases.length),
      casesFailed: cases.filter((c) => !c.pass).length,
      casesWithCriticalFailures: cases.filter((c) => c.critical.length).map((c) => ({ id: c.id, critical: c.critical })),
      casesWithPendingChecks: cases.filter((c) => c.pending.length).map((c) => c.id),
      byLanguage: breakdown('language'),
      byCategory: breakdown('category'),
      byConcept: breakdown('concept'),
    },
    referenceBased,
    referenceFreeProxies,
    consistencyGroups: groupRows,
    sweeps: { financial: fin.filter((r) => r.status !== 'pass'), language: lang.filter((r) => r.status !== 'pass'), financialTotal: fin.length, languageTotal: lang.length },
    synonymCoverage: synonymCoverage(),
    notRun: {
      liveAiResponses: 'not run — needs ANTHROPIC_API_KEY and --confirm (scripts: npm run eval:llm -- live --confirm)',
      llmJudge: 'not run — needs ANTHROPIC_API_KEY and --confirm (npm run eval:llm -- judge --confirm)',
      nativeSpeakerReview: `not done — ${cases.filter((c) => c.translationReview).length} Hindi/Telugu/code-mixed inputs and their responses are listed in native-review.csv with empty reviewer columns`,
    },
    cases,
  }
}

export type EvalReport = ReturnType<typeof evaluate>

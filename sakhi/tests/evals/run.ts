// Repeatable evaluation runner (deterministic layer; no network, no paid APIs).
//   npm run eval                → writes tests/evals/results/latest.{json,md} and native-review.csv
//   npm run eval -- --stamp     → also keeps a timestamped copy of the JSON report
import { mkdirSync, writeFileSync } from 'node:fs'
import { evaluate, loadDataset, type EvalReport } from './lib/evaluate'
import { KNOWN_FAILURES } from './known-failures'

const OUT = new URL('./results/', import.meta.url)

const pct = (m: { pass: number; total: number; rate: number | null }) => (m.total ? `${m.pass}/${m.total} (${m.rate}%)` : '—')

function markdown(r: EvalReport, ranAt: string) {
  const s = r.summary
  const rb = r.referenceBased
  const L: string[] = []
  L.push(`# Evaluation run — ${ranAt}`, '')
  L.push(`Dataset: ${r.dataset.name} v${r.dataset.version}, ${r.dataset.cases} cases. Deterministic layer only (no model calls).`, '')
  L.push(`- Cases fully passed: **${pct(s.casesFullyPassed)}**`)
  L.push(`- Passed deterministic checks but final label needs a live AI run: **${s.casesPassedWithPending}**`)
  L.push(`- Failed: **${s.casesFailed}**, of which with critical failures: **${s.casesWithCriticalFailures.length}**`, '')
  L.push('## Reference-based', '', '| Metric | Result |', '|---|---|')
  L.push(`| Financial calculation accuracy — reference table (app values + every language rendering + written arithmetic) | ${pct(rb.financialCalculationAccuracy.referenceTable)} |`)
  L.push(`| Financial calculation accuracy — spoken amount parsing (cases with an expected amount) | ${pct(rb.financialCalculationAccuracy.spokenAmountParsing)} |`)
  L.push(`| Correct-answer classification — recall (correct answers recognised as correct) | ${pct(rb.correctAnswerClassification.recall)} |`)
  L.push(`| Correct-answer classification — precision (answers marked correct that really were) | ${pct(rb.correctAnswerClassification.precision)} |`)
  L.push(`| Misconception detection (exact code) | ${pct(rb.misconceptionDetection)} |`)
  L.push(`| Classification overall (pending AI labels excluded) | ${pct(rb.classificationOverall)} |`)
  L.push(`| Routing (score / confirm / prompt / AI / redirect) | ${pct(rb.routing)} |`)
  L.push(`| Lesson progression correctness (next action) | ${pct(rb.lessonProgressionCorrectness)} |`)
  L.push(`| Response schema validity (learner-facing responses) | ${pct(rb.responseSchemaValidity)} |`)
  L.push(`| Cross-language consistency — content sweep | ${pct(rb.crossLanguageConsistency.contentSweep)} |`)
  L.push(`| Cross-language consistency — same answer in en/hi/te gives same result | ${pct(rb.crossLanguageConsistency.caseGroups)} |`, '')
  L.push('## Reference-free (automated proxies on approved responses — not rubric scores)', '', '| Criterion | Proxy pass rate |', '|---|---|')
  for (const [k, v] of Object.entries(r.referenceFreeProxies)) L.push(`| ${k} | ${pct(v)} |`)
  L.push('', '## By language / category / concept', '')
  for (const [name, b] of [['Language', s.byLanguage], ['Category', s.byCategory], ['Concept', s.byConcept]] as const)
    L.push(`**${name}:** ` + Object.entries(b).map(([k, v]) => `${k} ${pct(v)}`).join(' · '), '')
  L.push('## Failed cases', '', '| Case | Input | Critical | Failed checks |', '|---|---|---|---|')
  for (const c of r.cases.filter((x) => !x.pass)) {
    const failed = Object.entries(c.checks)
      .filter(([, v]) => v.status === 'fail')
      .map(([k, v]) => `${k}: ${v.detail}`)
      .join('<br>')
    L.push(`| ${c.id} | ${c.input.replace(/\|/g, '/')} | ${c.critical.join(', ') || '—'} | ${failed} |`)
  }
  L.push('', '## Pending (needs live AI run)', '')
  for (const c of r.cases.filter((x) => x.pending.length)) L.push(`- ${c.id}: ${c.checks.classification.detail}`)
  L.push('', '## Not run', '')
  for (const [k, v] of Object.entries(r.notRun)) L.push(`- **${k}**: ${v}`)
  return L.join('\n') + '\n'
}

function reviewCsv(r: EvalReport) {
  const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const rows = r.cases.filter((c) => c.translationReview)
  return [
    ['case_id', 'language', 'category', 'learner_input', 'app_response', 'translation_status', 'REVIEW_input_is_natural', 'REVIEW_response_meaning_correct', 'REVIEW_response_natural_respectful', 'REVIEW_reviewer_name', 'REVIEW_notes'].join(','),
    ...rows.map((c) => [c.id, c.language, c.category, c.input, c.system.responseText, c.translationReview, '', '', '', '', ''].map(esc).join(',')),
  ].join('\n')
}

async function main() {
  const ranAt = new Date().toISOString()
  // --holdout → held-out v1 (seen and partly fixed); --holdout2 → held-out v2 (written after the multilingual round)
  const v4 = process.argv.includes('--holdout4')
  const v3 = process.argv.includes('--holdout3')
  const v2 = process.argv.includes('--holdout2')
  const holdout = v4 || v3 || v2 || process.argv.includes('--holdout')
  const file = v4 ? './dataset/holdout.v4.json' : v3 ? './dataset/holdout.v3.json' : v2 ? './dataset/holdout.v2.json' : './dataset/holdout.v1.json'
  const r = evaluate(holdout ? loadDataset(new URL(file, import.meta.url)) : undefined)
  mkdirSync(OUT, { recursive: true })
  if (holdout) {
    const base = v4 ? 'holdout4-latest' : v3 ? 'holdout3-latest' : v2 ? 'holdout2-latest' : 'holdout-latest'
    writeFileSync(new URL(`${base}.json`, OUT), JSON.stringify({ ranAt, ...r }, null, 1))
    writeFileSync(new URL(`${base}.md`, OUT), markdown(r, ranAt))
    console.log(markdown(r, ranAt))
    return
  }
  const json = JSON.stringify({ ranAt, ...r }, null, 1)
  writeFileSync(new URL('latest.json', OUT), json)
  if (process.argv.includes('--stamp')) writeFileSync(new URL(`run-${ranAt.replace(/[:.]/g, '-')}.json`, OUT), json)
  writeFileSync(new URL('latest.md', OUT), markdown(r, ranAt))
  writeFileSync(new URL('native-review.csv', OUT), reviewCsv(r))

  const failed = r.cases.filter((c) => !c.pass).map((c) => c.id)
  const unexpected = failed.filter((id) => !KNOWN_FAILURES[id])
  const fixed = Object.keys(KNOWN_FAILURES).filter((id) => !failed.includes(id))
  console.log(markdown(r, ranAt).split('## By language')[0])
  console.log(`New failures (not in known-failures baseline): ${unexpected.join(', ') || 'none'}`)
  console.log(`Known failures now passing (update the baseline): ${fixed.join(', ') || 'none'}`)
  console.log('Wrote tests/evals/results/latest.json, latest.md, native-review.csv')
  if (unexpected.length) process.exitCode = 1
}
main()

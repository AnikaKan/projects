// Language-consistency runner.   npm run eval:consistency [-- --out <name>]
// Writes tests/evals/results/consistency-latest.{json,md} (or <name>.{json,md}).
import { mkdirSync, writeFileSync } from 'node:fs'
import { runConsistency, VARIETIES, type ConsistencyReport } from './lib/consistency'

const OUT = new URL('./results/', import.meta.url)
const f = (m: { pass: number; total: number }) => `${m.pass}/${m.total} (${m.total ? Math.round((1000 * m.pass) / m.total) / 10 : 0}%)`

export function markdown(r: ConsistencyReport, ranAt: string) {
  const s = r.summary
  const L = [`# Language-consistency run — ${ranAt}`, '', `Dataset: ${r.dataset.name} v${r.dataset.version}: ${r.dataset.groups} groups × 7 language varieties = ${r.dataset.variants} utterances. Text transcripts only (no audio).`, '']
  L.push(`- Utterances with the expected result: **${f(s.variants)}**`)
  L.push(`- Groups where all 7 varieties pass: **${f(s.groupsAllPass)}**`)
  L.push(`- Groups with equivalent scoring (same classification, correctness and option in every variety): **${f(s.groupsEquivalentScoring)}**`)
  L.push(`- Utterances with a critical failure: **${s.critical.length}**`, '')
  L.push('| Variety | ' + VARIETIES.join(' | ') + ' |', '|---|' + VARIETIES.map(() => '---').join('|') + '|')
  L.push('| Pass | ' + VARIETIES.map((v) => f(s.byVariety[v])).join(' | ') + ' |', '')
  L.push('**By category:** ' + Object.entries(s.byCategory).map(([k, v]) => `${k} ${f(v)}`).join(' · '), '')
  if (s.critical.length) {
    L.push('## Critical', '', '| Group | Variety | Utterance | Critical |', '|---|---|---|---|')
    for (const c of s.critical) L.push(`| ${c.group} | ${c.variety} | ${c.text} | ${c.critical.join(', ')} |`)
    L.push('')
  }
  L.push('## Failing utterances', '', '| Group | Variety | Utterance | Got | Failed checks |', '|---|---|---|---|---|')
  for (const v of r.variants.filter((x) => !x.pass))
    L.push(`| ${v.group} | ${v.variety} | ${v.text} | ${v.got.intent}${v.got.optionId ? ':' + v.got.optionId : ''} | ${v.failed.join('; ')} |`)
  return L.join('\n') + '\n'
}

async function main() {
  const ranAt = new Date().toISOString()
  const i = process.argv.indexOf('--out')
  const name = i > 0 ? process.argv[i + 1] : 'consistency-latest'
  const r = runConsistency()
  mkdirSync(OUT, { recursive: true })
  writeFileSync(new URL(`${name}.json`, OUT), JSON.stringify({ ranAt, ...r }, null, 1))
  writeFileSync(new URL(`${name}.md`, OUT), markdown(r, ranAt))
  console.log(markdown(r, ranAt))
}
void main()

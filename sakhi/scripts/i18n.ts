// Translation review CLI.
//   npm run i18n:export                     → translations/review.csv (all UI, assessment and lesson text)
//   npm run i18n:import translations/review.csv → validates edits, writes src/i18n/translation-overrides.json
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { buildOverrides, collectEntries, parseCsv, toCsv } from '../src/i18n/review'

const [cmd, file = 'translations/review.csv'] = process.argv.slice(2)

if (cmd === 'export') {
  mkdirSync('translations', { recursive: true })
  const rows = collectEntries()
  writeFileSync(file, toCsv(rows), 'utf8')
  console.log(`Wrote ${rows.length} strings to ${file}. Edit the hi / te columns only, then run i18n:import.`)
} else if (cmd === 'import') {
  const res = buildOverrides(parseCsv(readFileSync(file, 'utf8')))
  writeFileSync('src/i18n/translation-overrides.json', JSON.stringify(res.overrides, null, 2) + '\n', 'utf8')
  console.log(`Applied ${res.changed} reviewed translation(s) to src/i18n/translation-overrides.json.`)
  for (const r of res.rejected) console.warn(`Rejected ${r.namespace} ${r.key} [${r.lang}]: ${r.reason}`)
  if (res.rejected.length) process.exitCode = 1
} else {
  console.log('Usage: i18n.ts export [file] | import [file]')
  process.exitCode = 2
}

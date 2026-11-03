// Pre-generates Sarvam audio for STANDARD lesson text (no personal data) so lessons play instantly and offline.
//   npm run audio:pregen -- --dry-run            count strings, characters and estimated cost (no API calls)
//   SARVAM_API_KEY=… npm run audio:pregen -- --confirm-license [--slow]
// Writes public/audio/<sha256>.mp3 and public/audio/manifest.json (keys match src/speech/SarvamClient.audioKey).
// Before shipping generated audio, confirm Sarvam's terms permit storing and redistributing it.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { standardLessonSpeech } from '../src/learning/speech'
import { LESSONS } from '../src/learning/storage'
import { toSarvamSpeakable, SARVAM_PACE } from '../src/speech/sarvamText'
import { LANGUAGES } from '../src/speech/languages'
// @ts-expect-error — plain JS module shared with the backend
import { loadConfig, synthesize } from '../server/sarvam.mjs'

const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const paces = args.includes('--slow') ? [SARVAM_PACE.normal, SARVAM_PACE.slow] : [SARVAM_PACE.normal]
const PRICE_PER_1000 = { 'bulbul:v3': 3.0, 'bulbul:v4-flash': 1.0 } as Record<string, number> // ₹, pay-as-you-go, excl. GST (docs, 2026-10-28)

const items = Object.values(LESSONS).flatMap((c) => (c ? standardLessonSpeech(c) : []))
const jobs = paces.flatMap((pace) =>
  [...new Map(items.map((i) => [`${i.lang}|${toSarvamSpeakable(i.text, i.lang)}`, i])).values()].map((i) => {
    const prepared = toSarvamSpeakable(i.text, i.lang)
    const bcp47 = LANGUAGES[i.lang].bcp47
    return { bcp47, pace, prepared, key: createHash('sha256').update(`${bcp47}|${pace}|${prepared}`).digest('hex') }
  }),
)
const chars = jobs.reduce((n, j) => n + j.prepared.length, 0)
const config = loadConfig()
const price = PRICE_PER_1000[config.tts.model]
console.log(`${jobs.length} clips · ${chars} characters · model ${config.tts.model}` + (price ? ` · est. ₹${((chars / 1000) * price).toFixed(2)} excl. GST` : ''))
for (const lang of ['en-IN', 'hi-IN', 'te-IN']) console.log(`  ${lang}: ${jobs.filter((j) => j.bcp47 === lang).length} clips`)

if (dry) process.exit(0)
if (!config.apiKey) {
  console.error('SARVAM_API_KEY is not set (backend env). Nothing generated.')
  process.exit(1)
}
if (!args.includes('--confirm-license')) {
  console.error('Add --confirm-license after confirming Sarvam’s terms allow storing/distributing generated audio.')
  process.exit(1)
}

async function main() {
  mkdirSync('public/audio', { recursive: true })
  const manifestPath = 'public/audio/manifest.json'
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { entries: {} }
  manifest.model = config.tts.model
  manifest.speakers = config.tts.speakers
  manifest.generatedAt = new Date().toISOString()
  let done = 0
  for (const j of jobs) {
    if (manifest.entries[j.key] && existsSync(`public/audio/${manifest.entries[j.key]}`)) continue
    const r = await synthesize({ text: j.prepared, languageCode: j.bcp47, pace: j.pace, config })
    writeFileSync(`public/audio/${j.key}.mp3`, r.audio)
    manifest.entries[j.key] = `${j.key}.mp3`
    done++
    await new Promise((res) => setTimeout(res, 1100)) // stay under 60 req/min (pay-as-you-go limit)
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Generated ${done} new clips → public/audio/`)
}
main().catch((e) => {
  console.error('Pre-generation stopped:', e?.code ?? e)
  process.exitCode = 1
})

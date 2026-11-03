// Live Sarvam evaluation (needs SARVAM_API_KEY in the backend env and network access to api.sarvam.ai).
//   SARVAM_API_KEY=… npm run eval:sarvam
// Produces eval-output/report.json and one mp3 per script/language for human listening.
// It measures what a script CAN measure: TTS latency, STT latency, and a SYNTHETIC round trip
// (Sarvam TTS audio → Sarvam STT → our amount parser). It does not rate naturalness — people must.
import { mkdirSync, writeFileSync } from 'node:fs'
import { TTS_SCRIPTS, STT_PROMPTS } from '../src/dev/voiceLabScripts'
import { toSarvamSpeakable, SARVAM_PACE } from '../src/speech/sarvamText'
import { LANGUAGES } from '../src/speech/languages'
import { parseSpokenAmount } from '../src/speech/numbers'
import type { Lang } from '../src/i18n/strings'
// @ts-expect-error — plain JS module shared with the backend
import { loadConfig, synthesize, transcribe } from '../server/sarvam.mjs'

const config = loadConfig()
if (!config.apiKey) {
  console.error('SARVAM_API_KEY is not set. No evaluation run.')
  process.exit(1)
}
async function main() {
  mkdirSync('eval-output', { recursive: true })
  const report: Record<string, unknown>[] = []
  const langs: Lang[] = ['en', 'hi', 'te']

  for (const lang of langs) {
    const bcp47 = LANGUAGES[lang].bcp47
    for (const s of TTS_SCRIPTS) {
      const t0 = Date.now()
      try {
        const r = await synthesize({ text: toSarvamSpeakable(s.text[lang], lang), languageCode: bcp47, pace: SARVAM_PACE.normal, config })
        const file = `eval-output/tts-${lang}-${s.id}.mp3`
        writeFileSync(file, r.audio)
        report.push({ kind: 'tts', lang: bcp47, script: s.id, speaker: config.tts.speakers[bcp47], model: config.tts.model, latencyMs: Date.now() - t0, bytes: r.audio.length, file })
      } catch (e) {
        report.push({ kind: 'tts', lang: bcp47, script: s.id, error: (e as { code?: string }).code ?? String(e) })
      }
      await new Promise((res) => setTimeout(res, 1100))
    }
    // Synthetic round trip for amounts: speak the prompt with Sarvam TTS, transcribe it with Sarvam STT.
    for (const p of STT_PROMPTS) {
      const phrase = p.say[lang].split(' / ')[0]
      try {
        const audio = (await synthesize({ text: phrase, languageCode: bcp47, pace: SARVAM_PACE.normal, config })).audio
        const t0 = Date.now()
        const r = await transcribe({ audio, mime: 'audio/mpeg', languageCode: bcp47, config })
        const parsed = parseSpokenAmount(r.transcript)
        report.push({ kind: 'stt-roundtrip-synthetic', lang: bcp47, prompt: p.id, spoken: phrase, transcript: r.transcript, parsedAmount: parsed, expected: p.expectAmount, ok: parsed === p.expectAmount, sttLatencyMs: Date.now() - t0, model: config.stt.model, mode: config.stt.mode })
      } catch (e) {
        report.push({ kind: 'stt-roundtrip-synthetic', lang: bcp47, prompt: p.id, error: (e as { code?: string }).code ?? String(e) })
      }
      await new Promise((res) => setTimeout(res, 1100))
    }
  }
  writeFileSync('eval-output/report.json', JSON.stringify({ runAt: new Date().toISOString(), config: { stt: config.stt, tts: { model: config.tts.model, speakers: config.tts.speakers } }, results: report }, null, 2))
  console.log(`Wrote eval-output/report.json (${report.length} rows). Listen to eval-output/*.mp3 and rate them in the Voice Lab or SARVAM.md template.`)
}
main().catch((e) => {
  console.error('Evaluation stopped:', e?.code ?? e)
  process.exitCode = 1
})

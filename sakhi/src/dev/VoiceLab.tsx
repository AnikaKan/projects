// DEVELOPMENT-ONLY voice comparison screen (#/dev/voices). Not linked from the learner app and
// only routed in dev builds (or when VITE_ENABLE_VOICE_LAB=1). Nothing here is pre-filled:
// every latency, transcript and rating comes from a real run on the evaluator's device.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Download, Mic, Play, Square } from 'lucide-react'
import type { Lang } from '../i18n/strings'
import { LANGUAGE_LIST, LANGUAGES, toSpeakable } from '../speech/languages'
import { getDefaultEngines, useOnline } from '../speech/SpeechContext'
import type { SarvamStatus } from '../speech/SarvamClient'
import { SARVAM_PACE, toSarvamSpeakable } from '../speech/sarvamText'
import { parseSpokenAmount } from '../speech/numbers'
import { STT_PROMPTS, TTS_SCRIPTS } from './voiceLabScripts'
import { SttError } from '../speech/SpeechRecognitionService'

type Engine = 'browser' | 'sarvam'
interface Rating {
  naturalness?: number
  pronunciation?: number
  numbers?: 'correct' | 'partly' | 'wrong'
  notes?: string
}
interface TtsRun {
  at: string
  lang: Lang
  script: string
  engine: Engine
  slow: boolean
  voice: string
  ok: boolean
  /** ms from request to audible start (browser: utterance onstart; Sarvam: audio 'playing') */
  latencyMs?: number
  /** Sarvam only: ms until audio bytes arrived */
  fetchMs?: number
  source?: 'network' | 'cache'
  error?: string
}
interface SttRun {
  at: string
  lang: Lang
  prompt: string
  engine: Engine
  transcript?: string
  parsedAmount?: number | null
  expected: number
  amountCorrect?: boolean
  /** ms from end of speech to transcript */
  latencyMs?: number
  error?: string
}

const KEY = 'hisaab.voicelab.v1'
const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as { ratings?: Record<string, Rating>; tts?: TtsRun[]; stt?: SttRun[] }
  } catch {
    return {}
  }
}

const BULBUL_V3_FOR_LAB: Record<Lang, string[]> = {
  // Per-language recommendations from Sarvam's speaker guide, then the top-rated defaults.
  en: ['ishita', 'ratan', 'shubh'],
  hi: ['priya', 'suhani', 'shubh', 'ashutosh', 'ishita'],
  te: ['neha', 'priya', 'shubh', 'ratan', 'ishita'],
}

export function VoiceLab() {
  const eng = useMemo(() => getDefaultEngines(), [])
  const online = useOnline()
  const [lang, setLang] = useState<Lang>('hi')
  const [status, setStatus] = useState<SarvamStatus | null>(null)
  const [browserVoice, setBrowserVoice] = useState<string>('…')
  const [speaker, setSpeaker] = useState<Record<Lang, string>>({ en: 'ishita', hi: 'priya', te: 'neha' })
  const saved = useMemo(load, [])
  const [ratings, setRatings] = useState<Record<string, Rating>>(saved.ratings ?? {})
  const [ttsRuns, setTtsRuns] = useState<TtsRun[]>(saved.tts ?? [])
  const [sttRuns, setSttRuns] = useState<SttRun[]>(saved.stt ?? [])
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    eng.client.status().then(setStatus)
  }, [eng])
  useEffect(() => {
    eng.browserTts.voiceFor(lang).then((v) => setBrowserVoice(v ? `${v.name} (${v.lang}${v.localService ? ', on device' : ', online'})` : 'none installed'))
  }, [eng, lang])
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ratings, tts: ttsRuns, stt: sttRuns }))
    } catch {
      /* ignore */
    }
  }, [ratings, ttsRuns, sttRuns])

  const stopAll = () => {
    eng.tts.stop()
    try {
      globalThis.speechSynthesis?.cancel()
    } catch {
      /* ignore */
    }
    labAudio?.pause()
  }

  async function playBrowser(scriptId: string, txt: string, slow: boolean) {
    stopAll()
    const run: TtsRun = { at: new Date().toISOString(), lang, script: scriptId, engine: 'browser', slow, voice: browserVoice, ok: false }
    const voice = await eng.browserTts.voiceFor(lang)
    if (!voice || !globalThis.speechSynthesis) return setTtsRuns((r) => [{ ...run, error: 'no voice for this language' }, ...r])
    const u = new SpeechSynthesisUtterance(toSpeakable(txt, lang))
    u.lang = LANGUAGES[lang].bcp47
    u.voice = speechSynthesis.getVoices().find((v) => v.name === voice.name) ?? null
    u.rate = slow ? 0.7 : 0.95
    const t0 = performance.now()
    u.onstart = () => setTtsRuns((r) => [{ ...run, ok: true, latencyMs: Math.round(performance.now() - t0) }, ...r])
    u.onerror = (e) => setTtsRuns((r) => [{ ...run, error: e.error }, ...r])
    speechSynthesis.speak(u)
  }

  async function playSarvam(scriptId: string, txt: string, slow: boolean) {
    stopAll()
    const sp = speaker[lang]
    const run: TtsRun = { at: new Date().toISOString(), lang, script: scriptId, engine: 'sarvam', slow, voice: `${status?.tts?.model ?? 'bulbul'} · ${sp}`, ok: false }
    const t0 = performance.now()
    try {
      const { blob, fromCache } = await eng.client.tts(lang, toSarvamSpeakable(txt, lang), slow ? SARVAM_PACE.slow : SARVAM_PACE.normal, { cacheable: false, speaker: sp })
      const fetchMs = Math.round(performance.now() - t0)
      const url = URL.createObjectURL(blob)
      labAudio = new Audio(url)
      labAudio.onplaying = () => setTtsRuns((r) => [{ ...run, ok: true, fetchMs, latencyMs: Math.round(performance.now() - t0), source: fromCache ? 'cache' : 'network' }, ...r])
      labAudio.onended = () => URL.revokeObjectURL(url)
      await labAudio.play()
    } catch (e) {
      setTtsRuns((r) => [{ ...run, error: (e as { code?: string }).code ?? String(e) }, ...r])
    }
  }

  async function recognise(engine: Engine, promptId: string, expected: number) {
    stopAll()
    setBusy(`${engine}:${promptId}`)
    let endAt = 0
    const run: SttRun = { at: new Date().toISOString(), lang, prompt: promptId, engine, expected }
    try {
      const svc = engine === 'sarvam' ? eng.sarvamStt : eng.browserStt
      const r = await svc.listen(lang, { onProcessing: () => (endAt = performance.now()) })
      const parsed = parseSpokenAmount(r.transcript)
      setSttRuns((x) => [{ ...run, transcript: r.transcript, parsedAmount: parsed, amountCorrect: parsed === expected, latencyMs: endAt ? Math.round(performance.now() - endAt) : undefined }, ...x])
    } catch (e) {
      setSttRuns((x) => [{ ...run, error: e instanceof SttError ? `${e.code}${e.message.includes(':') ? ` (${e.message.split(': ')[1]})` : ''}` : String(e) }, ...x])
    } finally {
      setBusy(null)
    }
  }

  const rate = (key: string, patch: Rating) => setRatings((r) => ({ ...r, [key]: { ...r[key], ...patch } }))
  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ exportedAt: new Date().toISOString(), userAgent: navigator.userAgent, sarvam: status, browserVoice, speakers: speaker, ratings, tts: ttsRuns, stt: sttRuns }, null, 2)],
      { type: 'application/json' },
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `voice-lab-${new Date().toISOString().slice(0, 19)}.json`
    a.click()
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-[#F4F1EC] px-4 py-6 text-ink" data-testid="voice-lab">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-clay">Development only · not shown to learners</p>
          <h1 className="text-2xl font-bold">Voice Lab: browser vs Sarvam</h1>
          <p className="text-sm text-muted">
            Same script, same language, two engines. Latencies and transcripts below are measured live on this device. Ratings must come from native-speaker reviewers — leave them blank otherwise. No audio is stored; results stay in this browser until exported.
          </p>
          <div className="flex flex-wrap gap-2 text-sm" data-testid="lab-status">
            <Chip ok={online}>{online ? 'Online' : 'Offline — Sarvam unavailable'}</Chip>
            <Chip ok={!!status?.configured}>{status ? (status.configured ? `Sarvam: ${status.tts?.model} / ${status.stt?.model}${status.stt?.mode ? ` (${status.stt.mode})` : ''}` : 'Sarvam backend not configured') : 'Checking backend…'}</Chip>
            <Chip ok={browserVoice !== 'none installed'}>Browser voice: {browserVoice}</Chip>
            <Chip ok={eng.browserStt.isSupported()}>Browser STT: {eng.browserStt.isSupported() ? 'available' : 'not in this browser'}</Chip>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-white p-1 ring-1 ring-line" role="group" aria-label="Language">
            {LANGUAGE_LIST.map((l) => (
              <button key={l.code} lang={l.bcp47} onClick={() => setLang(l.code)} className={`min-h-[40px] rounded-full px-4 font-semibold ${lang === l.code ? 'bg-brand text-white' : ''}`}>
                {l.native}
              </button>
            ))}
          </div>
          <label className="text-sm">
            Sarvam speaker{' '}
            <select data-testid="lab-speaker" value={speaker[lang]} onChange={(e) => setSpeaker({ ...speaker, [lang]: e.target.value })} className="min-h-[40px] rounded-lg bg-white px-2 ring-1 ring-line">
              {BULBUL_V3_FOR_LAB[lang].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button onClick={stopAll} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-line">
            <Square size={14} /> Stop audio
          </button>
          <button onClick={exportJson} className="ml-auto inline-flex min-h-[40px] items-center gap-1 rounded-full bg-ink px-4 text-sm font-semibold text-white">
            <Download size={14} /> Export results (JSON)
          </button>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">1 · Text-to-speech: identical scripts</h2>
          {TTS_SCRIPTS.map((s) => (
            <div key={s.id} className="rounded-2xl bg-white p-4 ring-1 ring-line" data-testid={`script-${s.id}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="font-bold">{s.title}</h3>
                <span className="text-xs text-muted">{s.focus}</span>
              </div>
              <p lang={LANGUAGES[lang].bcp47} className="mt-2 text-lg leading-relaxed">
                {s.text[lang]}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {(['browser', 'sarvam'] as Engine[]).map((e) => {
                  const k = `${lang}|${s.id}|${e}${e === 'sarvam' ? `|${speaker[lang]}` : ''}`
                  const r = ratings[k] ?? {}
                  const last = ttsRuns.find((x) => x.lang === lang && x.script === s.id && x.engine === e)
                  return (
                    <div key={e} className="rounded-xl bg-[#FAF7F2] p-3 ring-1 ring-line">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="w-20 text-sm font-bold">{e === 'browser' ? 'Browser' : 'Sarvam'}</span>
                        <button data-testid={`play-${e}-${s.id}`} onClick={() => (e === 'browser' ? playBrowser : playSarvam)(s.id, s.text[lang], false)} className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-marigold px-3 text-sm font-semibold text-white">
                          <Play size={14} /> Play
                        </button>
                        <button onClick={() => (e === 'browser' ? playBrowser : playSarvam)(s.id, s.text[lang], true)} className="min-h-[40px] rounded-full bg-white px-3 text-sm font-semibold ring-1 ring-line">
                          Slow
                        </button>
                        <span className="text-xs text-muted" data-testid={`last-${e}-${s.id}`}>
                          {last ? (last.ok ? `${last.latencyMs} ms to audio${last.fetchMs !== undefined ? ` (fetch ${last.fetchMs} ms, ${last.source})` : ''}` : `error: ${last.error}`) : 'not played yet'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <Score label="Natural" value={r.naturalness} onChange={(v) => rate(k, { naturalness: v })} />
                        <Score label="Pronunciation" value={r.pronunciation} onChange={(v) => rate(k, { pronunciation: v })} />
                        <select aria-label="Numbers" value={r.numbers ?? ''} onChange={(ev) => rate(k, { numbers: (ev.target.value || undefined) as Rating['numbers'] })} className="min-h-[36px] rounded-lg bg-white px-2 ring-1 ring-line">
                          <option value="">Numbers…</option>
                          <option value="correct">read correctly</option>
                          <option value="partly">partly</option>
                          <option value="wrong">wrong</option>
                        </select>
                        <input aria-label="Notes" placeholder="Reviewer notes" value={r.notes ?? ''} onChange={(ev) => rate(k, { notes: ev.target.value })} className="min-h-[36px] flex-1 rounded-lg bg-white px-2 ring-1 ring-line" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold">2 · Speech-to-text: say the phrase, compare engines</h2>
          <p className="text-sm text-muted">Each button turns the microphone on once. Say the phrase naturally (any dialect). We record the words returned, the amount our parser extracts, and time from end of speech to result.</p>
          {STT_PROMPTS.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
              <span className="min-w-[220px] flex-1 text-lg" lang={LANGUAGES[lang].bcp47}>
                “{p.say[lang]}” <span className="text-xs text-muted">expect ₹{p.expectAmount} · {p.kind}</span>
              </span>
              {(['browser', 'sarvam'] as Engine[]).map((e) => (
                <button
                  key={e}
                  data-testid={`stt-${e}-${p.id}`}
                  disabled={!!busy}
                  onClick={() => recognise(e, p.id, p.expectAmount)}
                  className="inline-flex min-h-[40px] items-center gap-1 rounded-full bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Mic size={14} /> {busy === `${e}:${p.id}` ? 'Listening…' : e === 'browser' ? 'Browser' : 'Sarvam'}
                </button>
              ))}
            </div>
          ))}
          <RunTable runs={sttRuns.filter((r) => r.lang === lang)} />
        </section>
      </div>
    </div>
  )
}

let labAudio: HTMLAudioElement | null = null

function Chip({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <span className={`rounded-full px-3 py-1 font-semibold ${ok ? 'bg-leaf-soft text-leaf' : 'bg-clay-soft text-clay'}`}>{children}</span>
}

function Score({ label, value, onChange }: { label: string; value?: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="inline-flex items-center gap-1">
      <span className="text-xs text-muted">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} className="min-h-[36px] rounded-lg bg-white px-1 ring-1 ring-line">
        <option value="">–</option>
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
  )
}

function RunTable({ runs }: { runs: SttRun[] }) {
  if (!runs.length) return <p className="text-sm text-muted">No recognition runs yet for this language.</p>
  return (
    <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
      <table className="w-full text-left text-sm" data-testid="stt-runs">
        <thead className="bg-[#FAF7F2] text-xs uppercase text-muted">
          <tr>
            <th className="p-2">Engine</th>
            <th className="p-2">Prompt</th>
            <th className="p-2">Transcript</th>
            <th className="p-2">Amount</th>
            <th className="p-2">Latency</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, i) => (
            <tr key={i} className="border-t border-line">
              <td className="p-2 font-semibold">{r.engine}</td>
              <td className="p-2">{r.prompt}</td>
              <td className="p-2">{r.error ? <span className="text-clay">error: {r.error}</span> : r.transcript}</td>
              <td className="p-2">{r.error ? '—' : `${r.parsedAmount ?? 'none'} ${r.amountCorrect ? '✓' : '✗'} (expect ${r.expected})`}</td>
              <td className="p-2 tabular-nums">{r.latencyMs !== undefined ? `${r.latencyMs} ms` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

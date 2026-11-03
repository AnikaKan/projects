// Sarvam AI REST client (server-side only). Everything here is taken from the official docs
// (docs.sarvam.ai, reviewed 2026-10-28). Do not add parameters that are not documented there.
//
//   STT  POST https://api.sarvam.ai/speech-to-text   multipart/form-data, header api-subscription-key
//        fields: file, model (saaras:v3 | saaras:v4), mode (v3: transcribe|translate|verbatim|translit|codemix),
//        language_code (en-IN | hi-IN | te-IN | … | unknown). Sync REST accepts audio up to 30 s.
//   TTS  POST https://api.sarvam.ai/text-to-speech   JSON, header api-subscription-key
//        fields: text (≤2500 chars for v3), language_code, model (bulbul:v3 | bulbul:v4-flash | bulbul:v2),
//        speaker, pace (v3: 0.5–2.0), speech_sample_rate, output_audio_codec. Response: { audios: [base64] }.

export const SARVAM_BASE = 'https://api.sarvam.ai'
export const LANGUAGE_CODES = ['en-IN', 'hi-IN', 'te-IN']

/** bulbul:v3 speakers listed in the TTS API reference. */
export const BULBUL_V3_SPEAKERS = [
  'shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan', 'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya',
  'ratan', 'varun', 'manan', 'sumit', 'roopa', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun', 'sunny',
  'mani', 'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali',
]

/**
 * Per-language picks from Sarvam's "change the speaker voice" guide (female voices recommended for each language):
 * en-IN: ishita · hi-IN: priya, suhani · te-IN: neha, priya. Warmth/naturalness still needs native-speaker review.
 */
export const RECOMMENDED_SPEAKERS = { 'en-IN': ['ishita', 'ratan'], 'hi-IN': ['priya', 'suhani', 'shubh', 'ashutosh'], 'te-IN': ['neha', 'priya', 'shubh', 'ratan'] }

export function loadConfig(env = process.env) {
  return {
    apiKey: env.SARVAM_API_KEY || '',
    stt: { model: env.SARVAM_STT_MODEL || 'saaras:v3', mode: env.SARVAM_STT_MODE || 'transcribe' },
    tts: {
      model: env.SARVAM_TTS_MODEL || 'bulbul:v3',
      sampleRate: 22050,
      codec: 'mp3',
      speakers: { 'en-IN': env.SARVAM_SPEAKER_EN || 'ishita', 'hi-IN': env.SARVAM_SPEAKER_HI || 'priya', 'te-IN': env.SARVAM_SPEAKER_TE || 'neha' },
    },
  }
}

export class SarvamError extends Error {
  /** @param {string} code @param {number} status */
  constructor(code, status, detail = '') {
    super(`${code}${detail ? `: ${detail}` : ''}`)
    this.code = code
    this.status = status
  }
}

/** Maps upstream HTTP status to a stable code. Never includes request content. */
export function mapUpstreamStatus(status) {
  if (status === 400 || status === 422) return 'bad_request'
  if (status === 401 || status === 403) return 'upstream_auth'
  if (status === 402) return 'no_credits'
  if (status === 429) return 'rate_limited'
  return 'upstream_unavailable'
}

async function call(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal })
    if (!res.ok) {
      let upstreamCode = ''
      try {
        upstreamCode = (await res.json())?.error?.code ?? ''
      } catch {
        /* ignore */
      }
      throw new SarvamError(mapUpstreamStatus(res.status), res.status, upstreamCode)
    }
    return await res.json()
  } catch (e) {
    if (e instanceof SarvamError) throw e
    if (e?.name === 'AbortError') throw new SarvamError('timeout', 504)
    throw new SarvamError('upstream_unreachable', 502)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Speech-to-text. `audio` is a 16 kHz mono WAV produced in the browser.
 * @returns {Promise<{transcript: string, languageCode: string|null, requestId: string|null}>}
 */
export async function transcribe({ audio, mime = 'audio/wav', languageCode, config, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (!LANGUAGE_CODES.includes(languageCode)) throw new SarvamError('bad_language', 400)
  const form = new FormData()
  form.append('file', new Blob([audio], { type: mime }), 'speech.wav')
  form.append('model', config.stt.model)
  // `mode` is documented for saaras:v3 (and described for v4 on the model page); send it only for v3 to stay within the API reference.
  if (config.stt.model === 'saaras:v3') form.append('mode', config.stt.mode)
  form.append('language_code', languageCode)
  const json = await call(fetchImpl, `${SARVAM_BASE}/speech-to-text`, { method: 'POST', headers: { 'api-subscription-key': config.apiKey }, body: form }, timeoutMs)
  return { transcript: json.transcript ?? '', languageCode: json.language_code ?? null, requestId: json.request_id ?? null }
}

/**
 * Text-to-speech. Returns encoded audio bytes (mp3 by default).
 * @returns {Promise<{audio: Buffer, mime: string, requestId: string|null}>}
 */
export async function synthesize({ text, languageCode, speaker, pace = 1, config, fetchImpl = fetch, timeoutMs = 20000 }) {
  if (!LANGUAGE_CODES.includes(languageCode)) throw new SarvamError('bad_language', 400)
  if (!text || text.length > 2500) throw new SarvamError('bad_text_length', 400)
  if (!(pace >= 0.5 && pace <= 2)) throw new SarvamError('bad_pace', 400)
  const body = {
    text,
    language_code: languageCode,
    model: config.tts.model,
    speaker: speaker ?? config.tts.speakers[languageCode],
    pace,
    speech_sample_rate: config.tts.sampleRate,
    output_audio_codec: config.tts.codec,
  }
  const json = await call(
    fetchImpl,
    `${SARVAM_BASE}/text-to-speech`,
    { method: 'POST', headers: { 'api-subscription-key': config.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    timeoutMs,
  )
  const b64 = Array.isArray(json.audios) ? json.audios[0] : null
  if (!b64) throw new SarvamError('empty_audio', 502)
  return { audio: Buffer.from(b64, 'base64'), mime: config.tts.codec === 'mp3' ? 'audio/mpeg' : 'audio/wav', requestId: json.request_id ?? null }
}

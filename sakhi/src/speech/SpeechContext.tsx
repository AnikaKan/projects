import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { SpeechRecognitionService } from './SpeechRecognitionService'
import { SpeechSynthesisService } from './SpeechSynthesisService'
import { SarvamClient } from './SarvamClient'
import { HybridStt, HybridTts, SarvamSttService, SarvamTtsService } from './SarvamServices'
import { BrowserAudioCapture } from './audioCapture'
import type { EnginePreference, SttEngine, TtsEngine } from './engines'

export interface SpeechServices {
  stt: SttEngine
  tts: TtsEngine
  slow: boolean
  setSlow: (v: boolean) => void
  engine: EnginePreference
  setEngine: (e: EnginePreference) => void
}

const SLOW_KEY = 'hisaab.speech.slow'
const ENGINE_KEY = 'hisaab.speech.engine'
const read = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}

let preference: EnginePreference = (read(ENGINE_KEY) as EnginePreference) || 'auto'
const getPreference = () => preference

export interface DefaultEngines {
  client: SarvamClient
  browserStt: SpeechRecognitionService
  browserTts: SpeechSynthesisService
  sarvamStt: SarvamSttService
  sarvamTts: SarvamTtsService
  stt: HybridStt
  tts: HybridTts
}

// App-wide singletons: one recogniser and one speech queue, so audio never overlaps.
let defaults: DefaultEngines | null = null
export function getDefaultEngines(): DefaultEngines {
  if (defaults) return defaults
  const client = new SarvamClient()
  const browserStt = new SpeechRecognitionService()
  const browserTts = new SpeechSynthesisService()
  const sarvamStt = new SarvamSttService(client, new BrowserAudioCapture())
  const sarvamTts = new SarvamTtsService(client)
  defaults = {
    client,
    browserStt,
    browserTts,
    sarvamStt,
    sarvamTts,
    stt: new HybridStt(sarvamStt, browserStt, client, getPreference),
    tts: new HybridTts(sarvamTts, browserTts, client, getPreference),
  }
  return defaults
}

const Ctx = createContext<SpeechServices | null>(null)

/** Provides speech engines. Tests inject fakes via `stt` / `tts` (browser-style engines). */
export function SpeechProvider({ children, stt, tts }: { children: ReactNode; stt?: SttEngine; tts?: TtsEngine }) {
  const [slow, setSlowState] = useState(() => read(SLOW_KEY) === '1')
  const [engine, setEngineState] = useState<EnginePreference>(preference)
  const value = useMemo<SpeechServices>(() => {
    const d = stt && tts ? null : getDefaultEngines()
    return {
      stt: stt ?? d!.stt,
      tts: tts ?? d!.tts,
      slow,
      setSlow: (v) => {
        setSlowState(v)
        write(SLOW_KEY, v ? '1' : '0')
      },
      engine,
      setEngine: (e) => {
        preference = e
        write(ENGINE_KEY, e)
        setEngineState(e)
      },
    }
  }, [stt, tts, slow, engine])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSpeechServices(): SpeechServices {
  const c = useContext(Ctx)
  if (c) return c
  const d = getDefaultEngines()
  return { stt: d.stt, tts: d.tts, slow: false, setSlow: () => {}, engine: preference, setEngine: () => {} }
}

/** Place inside the router: stops speaking and listening whenever the screen changes. */
export function StopSpeechOnNavigate() {
  const { pathname } = useLocation()
  const { stt, tts } = useSpeechServices()
  useEffect(() => {
    return () => {
      tts.stop()
      stt.abort()
    }
  }, [pathname, stt, tts])
  return null
}

/** Live online/offline state from the browser (not assumed). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

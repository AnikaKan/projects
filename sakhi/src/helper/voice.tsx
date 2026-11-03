// Voice building blocks for the Business Helper. They only use the app's existing speech services
// (useSpeaker / useListener → browser Web Speech API, or Sarvam when the backend is configured).
// Nothing is faked: when speech is unavailable, the tap alternatives are shown with a clear notice.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Delete, Loader2, Mic, X } from 'lucide-react'
import { useApp } from '../state/AppState'
import { useListener, useSpeaker } from '../speech/useVoiceInteraction'
import { parseSpokenAmounts } from '../speech/numbers'
import { SpeakControls } from '../components/speech/SpeakControls'
import { MAX_AMOUNT, rupees } from './helperModel'
import type { SttErrorCode } from '../speech/SpeechRecognitionService'

const FATAL: SttErrorCode[] = ['unsupported', 'language-unsupported', 'permission-denied', 'audio-capture']
const ERR_KEY: Partial<Record<SttErrorCode, string>> = {
  unsupported: 'stt.err.unsupported',
  'language-unsupported': 'stt.err.language',
  'permission-denied': 'stt.err.permission',
  'audio-capture': 'stt.err.audio',
  'no-speech': 'stt.err.noSpeech',
  network: 'stt.err.network',
}

const activated = () => {
  const ua = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return !!ua?.hasBeenActive
}

/** Speaks `text` once when `key` changes, if the person has already tapped the page (browser rule). */
export function useAutoSpeak(text: string, key: string) {
  const { lang } = useApp()
  const sp = useSpeaker(lang)
  useEffect(() => {
    if (activated()) void sp.speak(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang])
  return sp
}

/** One question per screen: picture, big words, Listen (replay) and Slow. */
export function Question({ emoji, text, speakKey }: { emoji: string; text: string; speakKey: string }) {
  useAutoSpeak(text, speakKey)
  return (
    <div data-testid="bh-question">
      <div className="flex items-start gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-3xl" aria-hidden>
          {emoji}
        </span>
        <p className="pt-1 text-xl font-bold leading-snug" data-testid="bh-question-text">
          {text}
        </p>
      </div>
      <SpeakControls className="mt-3" text={text} />
    </div>
  )
}

/** Large microphone with listening / processing states. Returns the final transcript to `onText`. */
export function BigMic({ onText, size = 'lg', testid = 'bh-mic', label }: { onText: (t: string) => void; size?: 'lg' | 'md'; testid?: string; label?: string }) {
  const { t, lang } = useApp()
  const L = useListener(lang)
  const sp = useSpeaker(lang)
  const delivered = useRef<string | null>(null)
  useEffect(() => {
    if (L.status === 'result' && delivered.current !== L.transcript) {
      delivered.current = L.transcript
      onText(L.transcript)
      L.reset()
    }
    if (L.status !== 'result') delivered.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.status, L.transcript])

  if (L.error && FATAL.includes(L.error))
    return (
      <p data-testid={`${testid}-unavailable`} data-reason={L.error} className="rounded-2xl bg-white p-3 text-base leading-relaxed text-muted ring-1 ring-line">
        🎤✕ {t(ERR_KEY[L.error] ?? 'stt.err.unknown', { language: t(`lang.name.${lang}`) })}
      </p>
    )
  const busy = L.status === 'requesting' || L.status === 'listening' || L.status === 'processing'
  const px = size === 'lg' ? 'h-24 w-24' : 'h-[72px] w-[72px]'
  return (
    <div className="flex flex-col items-center gap-2" data-testid={`${testid}-panel`} data-status={L.status}>
      <button
        data-testid={testid}
        onClick={() => {
          if (busy) return L.cancel()
          sp.stop() // never listen while the app is talking
          void L.start()
        }}
        aria-label={busy ? t('stt.cancel') : (label ?? t('bh.tapSpeak'))}
        className={`relative grid ${px} place-items-center rounded-full text-white shadow-md ring-4 ${busy ? 'bg-clay ring-clay/20' : 'bg-brand ring-brand/15 active:bg-brand-dark'}`}
      >
        {L.status === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-clay/40 motion-reduce:hidden" />}
        {L.status === 'processing' || L.status === 'requesting' ? <Loader2 size={36} className="animate-spin" aria-hidden /> : busy ? <X size={36} aria-hidden /> : <Mic size={size === 'lg' ? 44 : 34} aria-hidden />}
      </button>
      <p className="text-lg font-bold" aria-live="polite" data-testid={`${testid}-status`}>
        {L.status === 'listening' ? t('bh.listening') : L.status === 'processing' || L.status === 'requesting' ? t('bh.processing') : (label ?? t('bh.tapSpeak'))}
      </p>
      {L.interim && busy && <p className="text-lg text-muted">“{L.interim}”</p>}
      {L.status === 'error' && L.error && (
        <p className="text-center text-base text-[#7A4A0E]" role="status" data-testid={`${testid}-error`}>
          {t(ERR_KEY[L.error] ?? 'stt.err.unknown', { language: t(`lang.name.${lang}`) })}
        </p>
      )}
    </div>
  )
}

/**
 * Amount entry: say it (the amount is read back for confirmation) or tap it on a large keypad.
 * The value is only accepted when she confirms it. `extra` adds a quick button (e.g. "No other costs" = 0).
 */
export function AmountInput({
  value,
  onConfirm,
  error,
  extra,
}: {
  value: number | null
  onConfirm: (n: number) => void
  error?: string | null
  extra?: { label: string; amount: number }
}) {
  const { t, lang } = useApp()
  const sp = useSpeaker(lang)
  const [typed, setTyped] = useState(value !== null ? String(value) : '')
  const [heard, setHeard] = useState<{ text: string; amount: number | null; several: number[] } | null>(null)
  const amount = typed === '' ? null : Number(typed)

  const onText = (text: string) => {
    const p = parseSpokenAmounts(text, lang)
    const n = p.value !== null && p.value <= MAX_AMOUNT ? p.value : null
    setHeard({ text, amount: n, several: p.ambiguous ? p.amounts : [] })
    if (n !== null) {
      setTyped(String(n))
      void sp.speak(t('bh.amt.heardQ', { x: rupees(n) })) // spoken confirmation of the amount
    }
  }
  const press = (d: string) => {
    setHeard(null)
    setTyped((x) => (d === 'del' ? x.slice(0, -1) : (x === '0' ? d : x + d).slice(0, 6)))
  }
  return (
    <div className="space-y-3" data-testid="bh-amount">
      <div className="flex items-center justify-center gap-2 rounded-2xl bg-white py-2 ring-2 ring-brand/30" data-testid="bh-amount-display" data-value={amount ?? ''}>
        <span className="text-4xl font-bold tabular-nums">{amount === null ? '₹ —' : rupees(amount)}</span>
      </div>
      {heard && (
        <div className="rounded-2xl bg-brand-soft p-3" data-testid="bh-heard" data-amount={heard.amount ?? ''}>
          <p className="text-base text-muted">{t('bh.heard', { x: heard.text })}</p>
          <p className="text-lg font-bold">
            {heard.amount !== null ? t('bh.amt.heardQ', { x: rupees(heard.amount) }) : heard.several.length > 1 ? t('bh.amt.several', { list: heard.several.map(rupees).join(', ') }) : t('bh.amt.noAmount')}
          </p>
        </div>
      )}
      <BigMic onText={onText} size="md" testid="bh-amount-mic" label={t('bh.amt.say')} />
      <p className="text-center text-base font-semibold text-muted">{t('bh.amt.type')}</p>
      <Keypad onPress={press} />
      {extra && (
        <button
          data-testid="bh-amount-extra"
          onClick={() => {
            setHeard(null)
            setTyped(String(extra.amount))
            onConfirm(extra.amount)
          }}
          className="min-h-[48px] w-full rounded-full bg-white text-base font-bold text-brand ring-2 ring-brand/40"
        >
          {extra.label}
        </button>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-clay-soft p-3 text-base font-semibold text-clay" data-testid="bh-amount-error">
          {error}
        </p>
      )}
      <button
        data-testid="bh-amount-confirm"
        disabled={amount === null || amount > MAX_AMOUNT}
        onClick={() => amount !== null && onConfirm(amount)}
        className="min-h-[56px] w-full rounded-full bg-brand text-lg font-bold text-white disabled:bg-disabled disabled:text-disabled-ink"
      >
        ✓ {heard?.amount !== null && heard ? t('bh.amt.yes') : t('bh.next')}
      </button>
    </div>
  )
}

function Keypad({ onPress }: { onPress: (d: string) => void }) {
  const { t } = useApp()
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'del']
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="bh-keypad">
      {keys.map((k) => (
        <button
          key={k}
          data-testid={`bh-key-${k}`}
          onClick={() => onPress(k)}
          aria-label={k === 'del' ? t('bh.amt.clear') : k}
          className="grid min-h-[52px] place-items-center rounded-xl bg-white text-2xl font-bold ring-1 ring-line active:bg-brand-soft"
        >
          {k === 'del' ? <Delete size={24} aria-hidden /> : k}
        </button>
      ))}
    </div>
  )
}

/** Picture card used on the home screen and for picture choices. */
export function PictureCard({ emoji, title, sub, onClick, soon, testid, selected }: { emoji: string; title: string; sub?: string; onClick: () => void; soon?: string; testid: string; selected?: boolean }) {
  return (
    <button
      data-testid={testid}
      data-soon={!!soon}
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-h-[112px] flex-col items-start justify-between gap-1 rounded-2xl p-3 text-left shadow-sm ring-2 ${
        soon ? 'border-2 border-dashed border-marigold bg-marigold-soft/60 ring-transparent' : selected ? 'bg-brand-soft ring-brand' : 'bg-white ring-brand/20 active:bg-brand-soft'
      }`}
    >
      <span className="text-4xl" aria-hidden>
        {emoji}
      </span>
      <span>
        <span className="block text-base font-bold leading-snug">{title}</span>
        {sub && <span className="block text-sm leading-snug text-muted">{sub}</span>}
        {soon && <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#7A4A0E]">{soon}</span>}
      </span>
    </button>
  )
}

export function Notice({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p className="rounded-2xl bg-white p-3 text-sm leading-relaxed text-muted ring-1 ring-line" data-testid={testid}>
      {children}
    </p>
  )
}

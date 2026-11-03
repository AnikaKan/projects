import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Mic, MicOff, RotateCcw, ShieldCheck, WifiOff, X } from 'lucide-react'
import { useApp } from '../../state/AppState'
import { useVoiceInteraction } from '../../speech/useVoiceInteraction'
import { useOnline } from '../../speech/SpeechContext'
import type { MatchableOption } from '../../speech/answerMatching'
import type { UtteranceIntent } from '../../speech/intent'
import { inr } from '../../lib/calc'
import type { SttErrorCode } from '../../speech/SpeechRecognitionService'

const ERROR_KEY: Record<SttErrorCode, string> = {
  unsupported: 'stt.err.unsupported',
  'language-unsupported': 'stt.err.language',
  'permission-denied': 'stt.err.permission',
  'no-speech': 'stt.err.noSpeech',
  'no-match': 'stt.err.noMatch',
  'audio-capture': 'stt.err.audio',
  network: 'stt.err.network',
  aborted: 'stt.err.unknown',
  busy: 'stt.err.unknown',
  unknown: 'stt.err.unknown',
}
/** Errors where trying again cannot help: hide the mic and keep tap answers only. */
const FATAL: SttErrorCode[] = ['unsupported', 'language-unsupported', 'permission-denied', 'audio-capture']

/**
 * Voice answer panel: press to speak → see the words → fix them if needed → confirm.
 * Confirming only selects an option; the screen's own Check/Confirm button still submits it.
 */
export function VoiceAnswer({
  options,
  onConfirm,
  onUnmatched,
  questionText,
}: {
  options: MatchableOption[]
  /** `transcript` = the (possibly corrected) words that were confirmed; optional for callers that only need the option. */
  onConfirm: (optionId: string, transcript?: string) => void
  /** Called once per recognition result that matched no option (e.g. to ask for an AI clarification). Never selects an answer. */
  onUnmatched?: (transcript: string) => void
  /** Read again when the learner asks to repeat ("say it again", "समझ नहीं आया"). */
  questionText?: string
}) {
  const { t, lang, offline: demoOffline } = useApp()
  const online = useOnline()
  const offline = demoOffline || !online
  const { listener: L, match, intent, listen: rawListen, speaker } = useVoiceInteraction(lang, options)
  // Sensitive words are removed from the screen and memory as soon as they are recognised.
  const [sensitive, setSensitive] = useState(false)
  const listen = () => {
    setSensitive(false)
    speaker.stop() // never listen while the app is talking (the microphone would hear it)
    return rawListen()
  }
  const languageName = t(`lang.name.${lang}`)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (L.status === 'result') inputRef.current?.focus({ preventScroll: true })
  }, [L.status])
  // Fire on the arrival of a new result only (not on every edit of the words).
  const unmatchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (L.status !== 'result') {
      unmatchedFor.current = null
      return
    }
    if (unmatchedFor.current !== null || !intent || !L.transcript.trim()) return
    unmatchedFor.current = L.transcript
    if (intent.kind === 'sensitive_information') {
      setSensitive(true)
      L.setTranscript('')
      return
    }
    // Repeat → the question again. Simpler explanation → the question again, slowly (the lesson's AI layer, when
    // present, adds a simpler explanation; the assessment never explains, so it cannot give the answer away).
    if (intent.kind === 'clarification_request' && questionText) void speaker.speak(questionText, { slow: intent.mode === 'simplify' })
    // Only non-answers that are safe to interpret go to the (optional) AI layer. Sensitive information,
    // advice requests and two-amount answers are handled here with approved messages and never sent.
    if (FORWARD.includes(intent.kind) || (intent.kind === 'out_of_scope' && intent.reason === 'leave_lesson')) onUnmatched?.(L.transcript)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L.status, intent])

  if (offline)
    return (
      <Notice testid="stt-offline" icon={<WifiOff size={20} aria-hidden />}>
        {t('stt.err.network')}
      </Notice>
    )

  if (L.error && FATAL.includes(L.error))
    return (
      <Notice testid="stt-fallback" reason={L.error} icon={<MicOff size={20} aria-hidden />}>
        {t(ERROR_KEY[L.error], { language: languageName })}
      </Notice>
    )

  if (sensitive)
    return (
      <div className="rounded-2xl bg-clay-soft p-4" data-testid="stt-intent" data-kind="sensitive_information" role="alert">
        <p className="text-base font-semibold leading-relaxed">{t('intent.sensitive')}</p>
        <button data-testid="stt-retry" onClick={listen} className="mt-3 inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-brand ring-2 ring-brand">
          <RotateCcw size={18} aria-hidden /> {t('stt.retry')}
        </button>
      </div>
    )

  if (L.status === 'result') {
    const matched = match?.status === 'match' ? options.find((o) => o.id === match.optionId) : null
    const lowConfidence = intent?.kind === 'answer' && intent.confidence === 'low'
    return (
      <div className="rounded-2xl bg-brand-soft p-4 ring-1 ring-brand/20" data-testid="stt-result">
        <label className="block">
          <span className="text-sm font-semibold text-muted">{t('stt.heard')}</span>
          <input
            ref={inputRef}
            data-testid="stt-transcript"
            value={L.transcript}
            onChange={(e) => L.setTranscript(e.target.value)}
            lang={lang}
            className="mt-1 min-h-[48px] w-full rounded-xl bg-white px-3 text-lg font-semibold outline-none ring-2 ring-brand/40 focus:ring-brand"
            aria-describedby="stt-edit-hint"
          />
          <span id="stt-edit-hint" className="mt-1 block text-xs text-muted">
            {t('stt.editHint')}
          </span>
        </label>
        {matched ? (
          <p className="mt-3 text-base" data-testid="stt-match" data-option={matched.id} data-confidence={lowConfidence ? 'low' : 'high'}>
            {lowConfidence ? t('intent.didYouMean', { x: matched.label }) : t('stt.matches')} {!lowConfidence && <strong className="text-lg">{matched.label}</strong>}
          </p>
        ) : (
          <p className="mt-3 text-base leading-relaxed text-[#7A4A0E]" data-testid="stt-nomatch" data-kind={intent?.kind}>
            {intentMessage(intent, t, options, !!onUnmatched)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            data-testid="stt-confirm"
            disabled={!matched}
            onClick={() => {
              if (!matched) return
              onConfirm(matched.id, L.transcript)
              L.reset()
            }}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-base font-semibold text-white disabled:bg-disabled disabled:text-disabled-ink"
          >
            <Check size={18} aria-hidden /> {t('stt.confirm')}
          </button>
          <button data-testid="stt-retry" onClick={listen} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-brand ring-2 ring-brand">
            <RotateCcw size={18} aria-hidden /> {t('stt.retry')}
          </button>
        </div>
      </div>
    )
  }

  const busy = L.status === 'requesting' || L.status === 'listening' || L.status === 'processing'
  const statusText =
    L.status === 'requesting' ? t('stt.requesting') : L.status === 'listening' ? t('stt.listening') : L.status === 'processing' ? t('stt.processing') : t('stt.speak')

  return (
    <div data-testid="stt-panel" data-status={L.status} data-error={L.error ?? ''} className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-brand/20">
      <button
        data-testid="stt-mic"
        onClick={busy ? L.cancel : listen}
        aria-label={busy ? t('stt.cancel') : t('stt.speak')}
        className={`relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full text-white shadow-md ring-4 ${busy ? 'bg-clay ring-clay/20' : 'bg-brand ring-brand/15 active:bg-brand-dark'}`}
      >
        {L.status === 'listening' && <span className="absolute inset-0 animate-ping rounded-full bg-clay/40 motion-reduce:hidden" />}
        {L.status === 'processing' || L.status === 'requesting' ? <Loader2 size={32} className="animate-spin" aria-hidden /> : busy ? <X size={32} aria-hidden /> : <Mic size={34} aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
      <p className="text-xl font-bold leading-snug" aria-live="polite" data-testid="stt-status">
        {busy ? statusText : t('stt.tapSpeak')}
      </p>
      {L.interim && busy && (
        <p className="mt-1 max-w-full truncate text-lg text-muted" lang={lang} data-testid="stt-interim">
          “{L.interim}”
        </p>
      )}
      {L.status === 'error' && L.error && (
        <p className="mt-1 text-base leading-relaxed text-[#7A4A0E]" data-testid="stt-error" role="status">
          {t(ERROR_KEY[L.error], { language: languageName })}
        </p>
      )}
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
        <ShieldCheck size={13} aria-hidden /> {t('stt.privacy')}
      </p>
      </div>
    </div>
  )
}

function Notice({ children, icon, testid, reason }: { children: ReactNode; icon: ReactNode; testid: string; reason?: string }) {
  return (
    <div data-testid={testid} data-reason={reason} className="flex items-center gap-3 rounded-2xl bg-white p-3 text-base leading-snug text-muted ring-1 ring-line">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-line">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

/** Intents that are not answers but are safe to pass to the lesson's AI layer for a kind reply. */
const FORWARD: UtteranceIntent['kind'][] = ['clarification_request', 'unrelated', 'not_understood', 'ambiguous_option']

function intentMessage(intent: UtteranceIntent | null, t: (k: string, v?: Record<string, string | number>) => string, options: MatchableOption[], canExplain: boolean): string {
  switch (intent?.kind) {
    case 'clarification_request':
      return t(intent.mode === 'simplify' ? (canExplain ? 'intent.simplifyLesson' : 'intent.simplifyCheck') : 'intent.repeat')
    case 'out_of_scope':
      return t(intent.reason === 'advice' ? 'intent.advice' : 'intent.leave')
    case 'unrelated':
      return t('intent.unrelated')
    case 'ambiguous_amount': {
      // Only echo amounts that are on screen as choices (she can tap them); never introduce other amounts.
      const shown = intent.amounts.filter((a) => options.some((o) => o.amount === a))
      return shown.length >= 2 ? t('intent.whichAmount', { list: shown.map(inr).join(' / ') }) : t('intent.whichAmountGeneric')
    }
    case 'uncertain':
      return t('intent.uncertain')
    default:
      return t('stt.noMatch')
  }
}

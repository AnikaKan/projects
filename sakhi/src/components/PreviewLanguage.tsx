import { useEffect, useState } from 'react'
import { Volume2, VolumeX, X } from 'lucide-react'
import { useApp } from '../state/AppState'
import type { PreviewLanguage } from '../i18n/previewLanguages'

/** "Coming soon" badge used next to preview languages. */
export function ComingSoon({ className = '' }: { className?: string }) {
  const { t } = useApp()
  return <span className={`shrink-0 rounded-full bg-marigold-soft px-3 py-1 text-sm font-bold text-[#7A4A0E] ring-1 ring-marigold/50 ${className}`}>{t('lang.preview')}</span>
}

/**
 * Preview of a language that is not built yet: its greeting, a "hear hello" button that only plays if the
 * phone has a voice for that language, and a clear way back. The app language does not change.
 */
export function PreviewLanguageSheet({ language, onClose }: { language: PreviewLanguage; onClose: () => void }) {
  const { t } = useApp()
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null | undefined>(undefined)
  useEffect(() => {
    if (!synth) return setVoice(null)
    const pick = () => setVoice(synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith(language.code)) ?? null)
    pick()
    const timer = window.setTimeout(pick, 600)
    return () => window.clearTimeout(timer)
  }, [synth, language.code])
  const hear = () => {
    if (!synth || !voice || typeof SpeechSynthesisUtterance === 'undefined') return
    const u = new SpeechSynthesisUtterance(language.greeting)
    u.lang = language.bcp47
    u.voice = voice
    synth.cancel()
    synth.speak(u)
  }
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div className="rounded-t-3xl bg-paper p-5 pb-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={language.native} data-testid="preview-lang" data-lang={language.code}>
        <div className="flex items-start justify-between gap-2">
          <ComingSoon />
          <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-full active:bg-line" aria-label={t('close')}>
            <X size={24} aria-hidden />
          </button>
        </div>
        <p className="mt-2 text-4xl font-bold leading-normal" lang={language.bcp47}>
          {language.greeting}
        </p>
        <p className="mt-1 text-xl font-bold">{t('lang.previewTitle', { language: language.native })}</p>
        <p className="mt-2 text-lg leading-relaxed text-muted">{t('lang.previewBody')}</p>
        {voice ? (
          <button onClick={hear} data-testid="preview-hear" className="mt-4 inline-flex min-h-[56px] items-center gap-3 rounded-full bg-marigold px-5 text-lg font-bold text-ink">
            <Volume2 size={24} aria-hidden /> {t('lang.previewHear')}
          </button>
        ) : (
          voice === null && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-white px-3 py-2 text-base text-muted ring-1 ring-line" data-testid="preview-novoice">
              <VolumeX size={20} className="mt-0.5 shrink-0" aria-hidden /> {t('tts.noVoice', { language: language.native })}
            </p>
          )
        )}
        <button onClick={onClose} data-testid="preview-back" className="mt-4 min-h-[60px] w-full rounded-full bg-brand px-6 text-xl font-bold text-white">
          {t('lang.previewBack')}
        </button>
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { Check, Volume2, VolumeX } from 'lucide-react'
import { useSpeaker } from '../speech/useVoiceInteraction'
import type { Lang } from '../i18n/strings'
import { useState } from 'react'
import { ScreenShell } from '../components/ScreenShell'
import { AudioButton, PrimaryButton } from '../components/ui'
import { StallIllustration } from '../components/Illustrations'
import { useApp } from '../state/AppState'
import { LANGS } from '../i18n/strings'
import { PREVIEW_LANGS, type PreviewLanguage } from '../i18n/previewLanguages'
import { ComingSoon, PreviewLanguageSheet } from '../components/PreviewLanguage'
import type { Business } from '../lib/calc'

export function LanguageScreen() {
  const { t, lang, setLang } = useApp()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<PreviewLanguage | null>(null)
  return (
    <ScreenShell
      step={{ n: 1, total: 3 }}
      footer={<PrimaryButton onClick={() => navigate('/onboarding/business')}>{t('continue')}</PrimaryButton>}
    >
      <div className="mt-1 flex items-center gap-3">
        <span className="text-4xl" aria-hidden>🗣️</span>
        <h2 className="text-[28px] font-bold leading-snug">{t('lang.title')}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {LANGS.map((l) => {
          const selected = lang === l.code
          return (
            <div
              key={l.code}
              lang={l.bcp47}
              className={`flex items-stretch overflow-hidden rounded-2xl ${selected ? 'bg-brand text-white ring-4 ring-brand' : 'bg-white ring-2 ring-line'}`}
            >
              <button onClick={() => setLang(l.code)} aria-pressed={selected} className="flex min-h-[76px] flex-1 items-center gap-3 px-4 py-2 text-left">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-white bg-white text-brand' : 'border-line'}`}
                  aria-hidden
                >
                  {selected && <Check size={18} strokeWidth={3} />}
                </span>
                <span>
                  <span className="block text-2xl font-bold leading-normal">{l.native}</span>
                  <span className={`block text-lg leading-normal ${selected ? 'text-white/90' : 'text-muted'}`}>{l.greeting}</span>
                </span>
              </button>
              <GreetingPlayer code={l.code} greeting={l.greeting} native={l.native} selected={selected} />
            </div>
          )
        })}
        {PREVIEW_LANGS.map((l) => (
          <button
            key={l.code}
            lang={l.bcp47}
            data-testid={`lang-preview-${l.code}`}
            onClick={() => setPreview(l)}
            className="flex min-h-[68px] w-full items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white/60 px-4 py-2 text-left"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-line" aria-hidden />
            <span className="flex-1">
              <span className="block text-2xl font-bold leading-normal text-muted">{l.native}</span>
            </span>
            <ComingSoon />
          </button>
        ))}
      </div>
      {preview && <PreviewLanguageSheet language={preview} onClose={() => setPreview(null)} />}
    </ScreenShell>
  )
}

const BUSINESSES: Business[] = ['vegetable', 'tea', 'grocery']

export function BusinessScreen() {
  const { t, business, setBusiness } = useApp()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<Business | null>(business)

  return (
    <ScreenShell
      back="/onboarding/language"
      step={{ n: 2, total: 3 }}
      footer={
        <PrimaryButton disabled={!picked} onClick={() => navigate('/assessment')}>
          {t('continue')}
        </PrimaryButton>
      }
    >
      <h2 className="text-[26px] font-bold leading-snug">{t('biz.title')}</h2>
      <p className="mt-1 text-base leading-relaxed text-muted">{t('biz.sub')}</p>
      <AudioButton className="mt-3" text={`${t('biz.title')} ${t('biz.sub')} ${t('biz.vegetable')}. ${t('biz.tea')}. ${t('biz.grocery')}.`} />
      <div className="mt-4 space-y-3">
        {BUSINESSES.map((b) => {
          const selected = picked === b
          return (
            <button
              key={b}
              onClick={() => {
                setPicked(b)
                setBusiness(b)
              }}
              aria-pressed={selected}
              className={`flex w-full items-center gap-3 rounded-2xl p-2 pr-4 text-left ${selected ? 'bg-brand-soft ring-4 ring-brand' : 'bg-white ring-1 ring-line'}`}
            >
              <span className="w-[120px] shrink-0 overflow-hidden rounded-xl bg-[#FFF8EE]">
                <StallIllustration business={b} />
              </span>
              <span className="flex-1 text-xl font-bold leading-snug">{t(`biz.${b}`)}</span>
              {selected && (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden>
                  <Check size={18} strokeWidth={3} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </ScreenShell>
  )
}

/** Plays the greeting in that language's own voice. Never uses another language's voice. */
function GreetingPlayer({ code, greeting, native, selected }: { code: Lang; greeting: string; native: string; selected: boolean }) {
  const { t } = useApp()
  const sp = useSpeaker(code)
  const unavailable = sp.availability === 'no-voice' || sp.availability === 'unsupported'
  return (
    <button
      data-testid={`greet-${code}`}
      data-availability={sp.availability}
      disabled={unavailable}
      onClick={() => (sp.state === 'speaking' ? sp.stop() : sp.speak(greeting))}
      className={`grid w-16 place-items-center border-l disabled:opacity-60 ${selected ? 'border-white/30' : 'border-line'}`}
      aria-label={unavailable ? t('tts.noVoice', { language: native }) : `${native} — ${t('listen')}`}
      title={unavailable ? t('tts.noVoice', { language: native }) : undefined}
    >
      <span className={`grid h-11 w-11 place-items-center rounded-full ${sp.state === 'speaking' ? 'bg-marigold text-white' : selected ? 'bg-white/20' : 'bg-marigold-soft text-ink'}`}>
        {unavailable ? <VolumeX size={20} aria-hidden /> : <Volume2 size={20} aria-hidden />}
      </span>
    </button>
  )
}

import { useOnline } from '../speech/SpeechContext'
import { useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, Globe, WifiOff, X } from 'lucide-react'
import { useApp } from '../state/AppState'
import { LANGS } from '../i18n/strings'
import { StepDots } from './ui'
import { PREVIEW_LANGS, type PreviewLanguage } from '../i18n/previewLanguages'
import { ComingSoon, PreviewLanguageSheet } from './PreviewLanguage'

interface Props {
  title?: string
  back?: string | true
  nav?: boolean
  footer?: ReactNode
  step?: { n: number; total: number; label?: string }
  children: ReactNode
}

export function ScreenShell({ title, back, nav, footer, step, children }: Props) {
  const { t, offline: demoOffline, lang } = useApp()
  const online = useOnline()
  const offline = demoOffline || !online
  const navigate = useNavigate()
  const [sheet, setSheet] = useState(false)

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-paper text-ink">
      <header className="flex min-h-[60px] items-center gap-1 px-2 pt-1">
        {back ? (
          <button
            onClick={() => (back === true ? navigate(-1) : navigate(back))}
            className="grid h-12 w-12 place-items-center rounded-full text-ink active:bg-line"
            aria-label={t('back')}
          >
            <ChevronLeft size={28} aria-hidden />
          </button>
        ) : (
          <CoachEntryLogo />
        )}
        <h1 className="ml-1 line-clamp-2 min-w-0 flex-1 py-1 text-lg font-bold leading-tight">{title ?? t('appName')}</h1>
        <button
          onClick={() => setSheet(true)}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-sm font-bold text-brand ring-2 ring-brand/25 active:bg-brand-soft"
          aria-label={t('language')}
          data-testid="lang-button"
        >
          <Globe size={18} aria-hidden />
          <span className="leading-normal">{LANGS.find((l) => l.code === lang)?.native}</span>
        </button>
      </header>

      {step && (
        <div className="px-5 pb-2">
          <div className="mb-1 text-sm font-medium text-muted">{step.label ?? t('stepOf', { n: step.n, total: step.total })}</div>
          <StepDots n={step.n} total={step.total} />
        </div>
      )}

      {offline && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-xl bg-ink px-3 py-2 text-sm text-white">
          <WifiOff size={16} aria-hidden /> <span className="leading-snug" data-testid="offline-banner">{t('offline')} {t('offline.voice')}</span>
        </div>
      )}

      <main className="flex-1 overflow-y-auto px-5 pb-6 pt-2">{children}</main>

      {footer && <div className="border-t border-line bg-paper px-5 pb-4 pt-3">{footer}</div>}
      {nav && <BottomNav />}
      {sheet && <LanguageSheet onClose={() => setSheet(false)} />}
    </div>
  )
}

/** Learner tabs: Today · My Learning · Business (Business added 2026-11-01). Coach View is not here. */
function BottomNav() {
  const { t } = useApp()
  const items = [
    { to: '/home', emoji: '☀️', label: t('nav.today'), testid: 'nav-home' },
    { to: '/journey', emoji: '🌱', label: t('nav.journey'), testid: 'nav-journey' },
    { to: '/helper', emoji: '🎙️', label: t('nav.helper'), testid: 'nav-helper' },
  ]
  return (
    <nav className="grid grid-cols-3 border-t-2 border-line bg-white" aria-label="Primary">
      {items.map(({ to, emoji, label, testid }) => (
        <NavLink
          key={to}
          to={to}
          data-testid={testid}
          className={({ isActive }) => `flex min-h-[64px] flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-sm font-bold leading-tight ${isActive ? 'text-brand' : 'text-muted'}`}
        >
          {({ isActive }) => (
            <>
              <span className={`grid h-8 w-14 place-items-center rounded-full text-xl ${isActive ? 'bg-brand-soft' : ''}`} aria-hidden>
                {emoji}
              </span>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * App logo. Coach View is kept out of the learner's way: a facilitator opens it by pressing and holding
 * the logo (or by going to #/coach). A normal tap does nothing surprising: it goes Home.
 */
function CoachEntryLogo() {
  const { t } = useApp()
  const navigate = useNavigate()
  const timer = useRef<number | null>(null)
  const held = useRef(false)
  const start = () => {
    held.current = false
    timer.current = window.setTimeout(() => {
      held.current = true
      navigate('/coach')
    }, 800)
  }
  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = null
  }
  return (
    <button
      data-testid="coach-entry"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => !held.current && navigate('/home')}
      onKeyDown={(e) => e.key === 'Enter' && e.shiftKey && navigate('/coach')}
      aria-label={`${t('appName')} · ${t('coach.hold')}`}
      className="ml-2 grid h-10 w-10 select-none place-items-center rounded-xl bg-brand text-lg font-bold text-white"
    >
      ₹
    </button>
  )
}

export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const { t, lang, setLang } = useApp()
  const [preview, setPreview] = useState<PreviewLanguage | null>(null)
  if (preview) return <PreviewLanguageSheet language={preview} onClose={() => setPreview(null)} />
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div className="max-h-[90%] overflow-y-auto rounded-t-3xl bg-paper p-5 pb-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('language')}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-2xl font-bold leading-normal"><span aria-hidden>🗣️ </span>{t('language')}</h2>
          <button onClick={onClose} className="grid h-12 w-12 place-items-center rounded-full active:bg-line" aria-label={t('close')}>
            <X size={24} aria-hidden />
          </button>
        </div>
        <div className="space-y-3">
          {LANGS.map((l) => (
            <button
              key={l.code}
              lang={l.bcp47}
              onClick={() => {
                setLang(l.code)
                onClose()
              }}
              className={`flex min-h-[64px] w-full items-center justify-between rounded-2xl px-4 py-2 text-2xl font-bold leading-normal ${
                lang === l.code ? 'bg-brand text-white' : 'bg-white ring-2 ring-line'
              }`}
            >
              {l.native}
              {lang === l.code && <Check size={24} aria-hidden />}
            </button>
          ))}
          {PREVIEW_LANGS.map((l) => (
            <button
              key={l.code}
              lang={l.bcp47}
              data-testid={`sheet-preview-${l.code}`}
              onClick={() => setPreview(l)}
              className="flex min-h-[60px] w-full items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-2xl font-bold leading-normal text-muted ring-2 ring-line"
            >
              {l.native}
              <ComingSoon />
            </button>
          ))}
        </div>
        <p className="mt-3 text-base text-muted">{t('langKept')}</p>
      </div>
    </div>
  )
}

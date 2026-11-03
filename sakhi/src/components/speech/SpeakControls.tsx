import type { ReactNode } from 'react'
import { Pause, Play, RotateCcw, Square, Turtle, Volume2, VolumeX } from 'lucide-react'
import { useApp } from '../../state/AppState'
import { useSpeaker } from '../../speech/useVoiceInteraction'
import type { Lang } from '../../i18n/strings'

/**
 * Read-aloud controls for one block of text: Listen/Replay, Pause/Resume, Stop, Slow.
 * Shows a clear notice (and stays silent) when no voice for the language is installed.
 */
export function SpeakControls({ text, label, className = '', lang: langOverride, compact, onPlay, personal }: { text: string; label?: string; className?: string; lang?: Lang; compact?: boolean; onPlay?: () => void; personal?: boolean }) {
  const app = useApp()
  const lang = langOverride ?? app.lang
  const { t } = app
  const sp = useSpeaker(lang)
  const languageName = t(`lang.name.${lang}`)

  if (sp.availability === 'unsupported' || sp.availability === 'no-voice')
    return (
      <p data-testid="tts-fallback" data-reason={sp.availability} className={`flex items-start gap-2 rounded-2xl bg-white px-3 py-2 text-base leading-relaxed text-muted ring-1 ring-line ${className}`}>
        <VolumeX size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span>{sp.availability === 'no-voice' ? t('tts.noVoice', { language: languageName }) : t('tts.unsupported')}</span>
      </p>
    )

  const speaking = sp.state === 'speaking'
  const paused = sp.state === 'paused'
  const mainLabel = label ?? (sp.played ? t('tts.replay') : t('tts.listen'))

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="tts-controls" data-state={sp.state}>
      {!speaking && !paused && (
        <button
          data-testid="tts-play"
          onClick={() => {
            onPlay?.()
            sp.speak(text, { personal })
          }}
          disabled={sp.availability === 'checking'}
          className="inline-flex min-h-[48px] items-center gap-2.5 rounded-full bg-marigold px-4 py-1.5 text-base font-bold text-ink shadow-sm active:bg-marigold/80 disabled:opacity-60"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/70 text-ink">
            {sp.played ? <RotateCcw size={18} aria-hidden /> : <Volume2 size={20} aria-hidden />}
          </span>
          <span className="text-left leading-snug">{mainLabel}</span>
        </button>
      )}
      {speaking && (
        <IconBtn testid="tts-pause" label={t('tts.pause')} onClick={sp.pause} active>
          <Pause size={18} aria-hidden />
        </IconBtn>
      )}
      {paused && (
        <IconBtn testid="tts-resume" label={t('tts.resume')} onClick={sp.resume} active>
          <Play size={18} aria-hidden />
        </IconBtn>
      )}
      {(speaking || paused) && (
        <IconBtn testid="tts-stop" label={t('tts.stop')} onClick={sp.stop}>
          <Square size={16} aria-hidden />
        </IconBtn>
      )}
      {!compact && (
        <button
          data-testid="tts-slow"
          aria-pressed={sp.slow}
          onClick={() => sp.setSlow(!sp.slow)}
          aria-label={t('tts.slow')}
          title={t('tts.slow')}
          className={`grid h-12 w-12 place-items-center rounded-full ring-2 ${sp.slow ? 'bg-brand text-white ring-brand' : 'bg-white text-ink ring-line'}`}
        >
          <Turtle size={22} aria-hidden />
        </button>
      )}
    </div>
  )
}

function IconBtn({ children, label, onClick, active, testid }: { children: ReactNode; label: string; onClick: () => void; active?: boolean; testid: string }) {
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      className={`inline-flex min-h-[48px] items-center gap-2 rounded-full px-4 text-base font-semibold ring-1 ${active ? 'bg-marigold text-white ring-marigold' : 'bg-white text-ink ring-line'}`}
    >
      {children}
      <span>{label}</span>
    </button>
  )
}

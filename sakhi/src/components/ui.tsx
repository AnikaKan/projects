import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Check, Volume2 } from 'lucide-react'
import { SpeakControls } from './speech/SpeakControls'

export function PrimaryButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      data-testid="primary"
      {...rest}
      className={`w-full min-h-[56px] rounded-full bg-brand px-6 py-2.5 text-lg font-bold leading-snug text-white shadow-sm
        active:bg-brand-dark disabled:bg-disabled disabled:text-disabled-ink focus-visible:outline focus-visible:outline-4 focus-visible:outline-marigold ${className}`}
    >
      {children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`min-h-[48px] rounded-full border-2 border-brand bg-white px-5 py-2 text-base font-semibold leading-snug text-brand
        active:bg-brand-soft focus-visible:outline focus-visible:outline-4 focus-visible:outline-marigold ${className}`}
    >
      {children}
    </button>
  )
}

/** Read-aloud button for a block of text (Listen/Replay, Pause, Stop, Slow). See components/speech. */
export function AudioButton({ text, label, className = '', personal, compact }: { text: string; label?: string; className?: string; personal?: boolean; compact?: boolean }) {
  return <SpeakControls text={text} label={label} className={className} personal={personal} compact={compact} />
}

/**
 * One answer choice: a big tap target with a picture cue, plus its own "hear this answer" button.
 * `reading` highlights the choice while it is being read aloud (see components/speech/ReadAloud).
 */
export function OptionCard({
  selected,
  onClick,
  children,
  tone,
  reading,
  onHear,
  hearLabel,
}: {
  selected?: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'right' | 'wrong'
  reading?: boolean
  onHear?: () => void
  hearLabel?: string
}) {
  const ring =
    tone === 'right'
      ? 'ring-4 ring-leaf bg-leaf-soft'
      : tone === 'wrong'
        ? 'ring-4 ring-clay bg-clay-soft'
        : reading
          ? 'ring-4 ring-marigold bg-marigold-soft reading-now'
          : selected
            ? 'ring-4 ring-brand bg-brand-soft'
            : 'ring-2 ring-line bg-white'
  return (
    <div className={`flex items-stretch overflow-hidden rounded-2xl transition ${ring}`} data-reading={reading ? 'true' : undefined}>
      <button
        onClick={onClick}
        aria-pressed={selected}
        className="flex min-h-[64px] flex-1 items-center gap-3 px-3 py-2 text-left text-lg font-semibold leading-snug text-ink"
      >
        {children}
        {selected && !tone && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-white" aria-hidden>
            <Check size={18} strokeWidth={3} />
          </span>
        )}
      </button>
      {onHear && (
        <button
          onClick={onHear}
          aria-label={hearLabel}
          title={hearLabel}
          data-testid="hear-choice"
          className={`grid w-14 shrink-0 place-items-center border-l-2 ${reading ? 'border-marigold/40 text-ink' : 'border-line text-muted'} active:bg-marigold-soft`}
        >
          <Volume2 size={22} aria-hidden />
        </button>
      )}
    </div>
  )
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div {...rest} className={`rounded-2xl ${/(^|\s)!?bg-/.test(className) ? '' : 'bg-card'} p-4 shadow-[0_1px_0_#E6DDD3,0_6px_20px_-12px_rgba(31,26,23,0.25)] ${className}`}>
      {children}
    </div>
  )
}

export function StepDots({ n, total }: { n: number; total: number }) {
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`h-2 flex-1 rounded-full ${i < n ? 'bg-brand' : 'bg-line'}`} />
      ))}
    </div>
  )
}

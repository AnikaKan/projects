import { CheckCircle2, Circle, CircleDashed, CircleDot } from 'lucide-react'
import type { Mastery } from '../state/AppState'
import { useApp } from '../state/AppState'

export const MASTERY_STYLE: Record<Mastery, { icon: typeof Circle; cls: string; fill: number }> = {
  notStarted: { icon: CircleDashed, cls: 'bg-line/60 text-muted', fill: 0 },
  introduced: { icon: Circle, cls: 'bg-marigold-soft text-[#8A5A12]', fill: 1 },
  practicing: { icon: CircleDot, cls: 'bg-brand-soft text-brand', fill: 2 },
  demonstrated: { icon: CheckCircle2, cls: 'bg-leaf-soft text-leaf', fill: 3 },
}

export function MasteryBadge({ state, coach }: { state: Mastery; coach?: boolean }) {
  const app = useApp()
  const t = coach ? app.tc : app.t
  const { icon: Icon, cls } = MASTERY_STYLE[state]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold leading-normal ${cls}`}>
      <Icon size={16} aria-hidden />
      {t(`state.${state}`)}
    </span>
  )
}

/** 3-segment meter; never a percentage or score. */
export function MasteryMeter({ state }: { state: Mastery }) {
  const f = MASTERY_STYLE[state].fill
  return (
    <span className="flex w-16 gap-1" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`h-2 flex-1 rounded-full ${i <= f ? (f === 3 ? 'bg-leaf' : f === 2 ? 'bg-brand' : 'bg-marigold') : 'bg-line'}`} />
      ))}
    </span>
  )
}

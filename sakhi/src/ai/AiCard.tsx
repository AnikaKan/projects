import { BookOpen, Loader2, Sparkles } from 'lucide-react'
import { SpeakControls } from '../components/speech/SpeakControls'
import { useApp } from '../state/AppState'
import type { LessonContent, LessonEvent, LessonState } from '../learning/types'
import { permittedAction } from './actions'
import type { AiAssistState } from './useAiAssist'

/**
 * Shows an AI explanation (or the approved fallback) for the current step.
 * A suggested next action becomes a button only if the lesson state machine allows it right now.
 */
export function AiCard({ ai, content, state, dispatch }: { ai: AiAssistState | null; content: LessonContent; state: LessonState; dispatch: (e: LessonEvent) => void }) {
  const { lang } = useApp()
  const T = content.text[lang]
  if (!ai) return null
  if (ai.loading)
    return (
      <p className="mt-3 flex items-center gap-2 text-base text-muted" data-testid="ai-loading" role="status">
        <Loader2 size={18} className="animate-spin" aria-hidden /> {T.ui.aiLoading}
      </p>
    )
  const r = ai.result
  if (!r) return null
  // An approved fallback that the screen already shows (new variant swapped in by the machine) is not repeated.
  if (r.source === 'fallback' && ai.mode === 'explain' && ai.machineChanged) return <span data-testid="ai-hidden" data-reason={r.reason} hidden />

  const fromAi = r.source === 'claude'
  const allowed = permittedAction(r.response.suggestedNextAction, state, content)
  const button = allowed?.event ? (
    <button
      data-testid="ai-action"
      data-action={allowed.action}
      onClick={() => dispatch(allowed.event!)}
      className="mt-3 inline-flex min-h-[48px] items-center rounded-full bg-brand px-5 text-base font-semibold text-white"
    >
      {allowed.action === 'retry' ? T.ui.tryAgain : T.ui.continue}
    </button>
  ) : null

  return (
    <div
      className={`mt-3 rounded-2xl p-4 ring-1 ${fromAi ? 'bg-[#F3F0FA] ring-[#6B5BA8]/25' : 'bg-white ring-line'}`}
      data-testid="ai-card"
      data-source={r.source}
      data-reason={r.reason ?? ''}
      data-type={r.response.responseType}
      data-suggested={r.response.suggestedNextAction}
      data-permitted={allowed?.action ?? 'none'}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-muted">
        {fromAi ? <Sparkles size={16} aria-hidden /> : <BookOpen size={16} aria-hidden />}
        {fromAi ? T.ui.aiLabel : T.ui.aiApproved}
      </div>
      <p className="mt-2 text-lg leading-relaxed" data-testid="ai-text" lang={lang}>
        {r.response.displayText}
      </p>
      <SpeakControls className="mt-2" text={r.response.spokenText} personal={fromAi} compact />
      {fromAi && <p className="mt-2 text-xs leading-snug text-muted">{T.ui.aiNote}</p>}
      {button}
    </div>
  )
}

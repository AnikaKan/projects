// The application, not Claude, decides whether a suggested next action is allowed.
// A suggestion is only ever turned into a button that dispatches a normal lesson event, and only if the
// state machine's own guards allow that event right now. Nothing here changes lesson state by itself.
import { canAdvance, canRetry, questionForStep } from '../learning/machine'
import type { LessonContent, LessonEvent, LessonState } from '../learning/types'
import type { AiNextAction } from './types'

export interface PermittedAction {
  action: AiNextAction
  /** The machine event the button would dispatch (repeat = replay audio, no event). */
  event: LessonEvent | null
}

export function permittedAction(suggested: AiNextAction, state: LessonState, content: LessonContent): PermittedAction | null {
  if (state.step === 'complete') return null
  switch (suggested) {
    case 'repeat':
      return { action: 'repeat', event: null }
    case 'retry': {
      const q = questionForStep(state.step)
      return q && canRetry(state, content, q) ? { action: 'retry', event: { type: 'RETRY' } } : null
    }
    case 'continue':
      return canAdvance(state) ? { action: 'continue', event: { type: 'NEXT' } } : null
  }
}

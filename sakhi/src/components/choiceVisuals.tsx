// Picture cues for answer choices, so a learner who reads slowly can recognise a choice at a glance.
// Emoji are used as simple, widely understood pictograms (rendered by the phone's own emoji font);
// amounts use the ₹ note picture. A cue never replaces the words: the words are also read aloud.
// Yes / No use neutral 👍 / 👎, never ✅ / ❌: on a question where "Yes" is the wrong answer a green tick
// would look like "this is correct" (demo-readiness review, 2026-11-01).
import type { Business } from '../lib/calc'
import { NoteIcon } from './Illustrations'

const EMOJI: Record<string, string> = {
  yes: '👍',
  no: '👎',
  unsure: '🤔',
  up: '📈',
  down: '📉',
  school: '🎒',
  clothes: '👗',
  mixed: '🏪',
  separate: '🏦',
  cashbox: '🧰',
  fixed: '🏠',
}
const STOCK: Record<Business, string> = { vegetable: '🥬', tea: '🥛', grocery: '📦' }

export function ChoiceCue({ id, amount, business }: { id: string; amount?: number; business: Business }) {
  const emoji = amount !== undefined ? null : id === 'stock' ? STOCK[business] : EMOJI[id]
  return (
    <span
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${id === 'unsure' ? 'bg-line/70' : 'bg-brand-soft'}`}
      aria-hidden
    >
      {amount !== undefined ? <NoteIcon /> : (emoji ?? <NoteIcon />)}
    </span>
  )
}

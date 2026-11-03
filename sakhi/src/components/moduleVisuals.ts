// Picture cues for the five topics and for learning states (UX redesign 2026-11-01).
import type { Mastery, ModuleId } from '../state/AppState'

export const MODULE_EMOJI: Record<ModuleId, string> = { m1: '💰', m2: '🧾', m3: '🤝', m4: '🪙', m5: '👛' }

/** Growth metaphor instead of scores: seed → sprout → plant → tree. Always shown with the words too. */
export const STATE_EMOJI: Record<Mastery, string> = { notStarted: '⚪', introduced: '🌱', practicing: '🌿', demonstrated: '🌳' }

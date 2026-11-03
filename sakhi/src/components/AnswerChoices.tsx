// Shared answer area for every question screen (diagnostic, lesson questions, practice):
//   [ 🔊 Listen (question + every choice, choice highlighted while read) | 🐢 ]
//   [ 🎤 big microphone ]            ← voice slot (VoiceAnswer), only before answering
//   [ feedback ]                     ← feedback slot, after answering
//   [ picture choice cards, each with its own 🔊 ]
import type { ReactNode } from 'react'
import { useApp } from '../state/AppState'
import { OptionCard } from './ui'
import { ChoiceCue } from './choiceVisuals'
import { ReadAloudBar, useReadAloud } from './speech/ReadAloud'

export interface Choice {
  id: string
  label: string
  amount?: number
}

export function AnswerChoices({
  question,
  choices,
  selectedId,
  toneFor,
  locked,
  onSelect,
  voice,
  feedback,
  readKey,
  hideReadBar,
  onListen,
}: {
  question: string
  choices: Choice[]
  selectedId?: string | null
  toneFor?: (id: string) => 'right' | 'wrong' | undefined
  locked?: boolean
  onSelect: (id: string) => void
  voice?: ReactNode
  feedback?: ReactNode
  /** Changes when a new question is shown, so it is read automatically once. */
  readKey?: string
  hideReadBar?: boolean
  /** Called when the learner taps Listen (e.g. the lesson machine counts replays). */
  onListen?: () => void
}) {
  const { t, business } = useApp()
  const ra = useReadAloud(question, choices, { auto: !locked, key: readKey })
  return (
    <div>
      {!hideReadBar && !locked && <ReadAloudBar ra={ra} onListen={onListen} className="mt-3" />}
      {voice && !locked && (
        <div className="mt-4" onClickCapture={() => ra.reading && ra.stop()}>
          {voice}
          <p className="mb-2 mt-4 text-center text-base font-semibold text-muted">{t('orTap')}</p>
        </div>
      )}
      {feedback}
      <div className={`space-y-3 ${feedback || !voice || locked ? 'mt-4' : ''}`}>
        {choices.map((c) => (
          <OptionCard
            key={c.id}
            selected={selectedId === c.id}
            tone={toneFor?.(c.id)}
            reading={ra.reading === c.id}
            onHear={() => void ra.playOne(c.id)}
            hearLabel={`${t('read.choice')}: ${c.label}`}
            onClick={() => {
              if (locked) return
              if (ra.reading) ra.stop()
              onSelect(c.id)
            }}
          >
            <span data-testid={`option-${c.id}`} className="shrink-0">
              <ChoiceCue id={c.id} amount={c.amount} business={business} />
            </span>
            <span className={`flex-1 ${c.amount !== undefined ? 'text-3xl font-bold tabular-nums' : ''} ${c.id === 'unsure' ? 'text-muted' : ''}`}>{c.label}</span>
          </OptionCard>
        ))}
      </div>
    </div>
  )
}

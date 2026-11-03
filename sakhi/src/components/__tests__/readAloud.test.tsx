// @vitest-environment jsdom
// UX redesign 2026-11-01: every question reads the question and each choice aloud, highlights the
// choice being read, and lets the learner replay or hear one choice. Tap and voice answers both work.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppStateProvider } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { SpeechProvider } from '../../speech/SpeechContext'
import { AnswerChoices } from '../AnswerChoices'
import { VoiceAnswer } from '../speech/VoiceAnswer'
import { flush, RecognitionHarness, SynthHarness, V } from '../../speech/__tests__/fakes'

let rec: RecognitionHarness
let synth: SynthHarness
const CHOICES = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'I’m not sure' },
]

function Q() {
  const [sel, setSel] = useState<string | null>(null)
  return (
    <>
      <AnswerChoices
        question="Is your profit ₹500?"
        choices={CHOICES}
        selectedId={sel}
        onSelect={setSel}
        voice={<VoiceAnswer options={CHOICES} questionText="Is your profit ₹500?" onConfirm={setSel} />}
      />
      <output data-testid="sel">{sel ?? ''}</output>
    </>
  )
}
const renderQ = () =>
  render(
    <AppStateProvider store={new MemoryStore()}>
      <SpeechProvider stt={rec.service()} tts={synth.service()}>
        <MemoryRouter>
          <Q />
        </MemoryRouter>
      </SpeechProvider>
    </AppStateProvider>,
  )

beforeEach(() => {
  localStorage.clear()
  rec = new RecognitionHarness()
  synth = new SynthHarness([V.enIN, V.hiIN, V.teIN])
})
afterEach(cleanup)

describe('read-aloud question and choices', () => {
  it('Listen reads the question, then every choice in order, highlighting each one while it is read', async () => {
    synth.hold = true // let each utterance finish only when we say so
    renderQ()
    await act(flush)
    await act(async () => {
      fireEvent.click(screen.getByTestId('tts-play'))
      await flush()
    })
    expect(synth.spoken.map((u) => u.text)).toEqual(['Is your profit 500 rupees?']) // amounts are read as words
    expect(screen.getByTestId('read-aloud').dataset.reading).toBe('question')
    for (const [i, c] of CHOICES.entries()) {
      await act(async () => {
        synth.finish()
        await flush()
      })
      expect(synth.spoken.at(-1)!.text).toBe(c.label)
      const cards = document.querySelectorAll('[data-reading="true"]')
      expect(cards).toHaveLength(1)
      expect(cards[0].textContent).toContain(c.label)
      expect(synth.spoken).toHaveLength(i + 2)
    }
    await act(async () => {
      synth.finish()
      await flush()
    })
    expect(document.querySelectorAll('[data-reading="true"]')).toHaveLength(0)
    expect(screen.getByTestId('read-aloud').dataset.reading).toBe('')
  })

  it('each choice has its own "hear this answer" button, and Stop stops the sequence', async () => {
    synth.hold = true
    renderQ()
    await act(flush)
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('hear-choice')[1])
      await flush()
    })
    expect(synth.spoken.at(-1)!.text).toBe('No')
    await act(async () => {
      synth.finish()
      await flush()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('tts-play'))
      await flush()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('tts-play')) // now "Stop"
      await flush()
    })
    expect(screen.getByTestId('read-aloud').dataset.reading).toBe('')
    const n = synth.spoken.length
    await act(async () => {
      synth.finish()
      await flush()
    })
    expect(synth.spoken.length).toBe(n) // nothing more is read after Stop
  })

  it('tap answers and voice answers both select a choice', async () => {
    renderQ()
    await act(flush)
    fireEvent.click(screen.getByTestId('option-unsure'))
    expect(screen.getByTestId('sel').textContent).toBe('unsure')
    rec.script = { kind: 'result', transcript: 'no' }
    await act(async () => {
      fireEvent.click(screen.getByTestId('stt-mic'))
      await flush()
    })
    await act(async () => {
      fireEvent.click(screen.getByTestId('stt-confirm'))
      await flush()
    })
    expect(screen.getByTestId('sel').textContent).toBe('no')
  })

  it('with no voice for the language, it shows the "no voice" notice and reads nothing', async () => {
    synth = new SynthHarness([V.hiIN])
    renderQ()
    await act(flush)
    await act(flush)
    expect(screen.getByTestId('tts-fallback').dataset.reason).toBe('no-voice')
    expect(synth.spoken).toHaveLength(0)
  })
})

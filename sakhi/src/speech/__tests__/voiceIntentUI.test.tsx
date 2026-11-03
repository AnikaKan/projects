// @vitest-environment jsdom
// VoiceAnswer + intent layer, as used on assessment, lesson and practice screens (regressions from the evaluation).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { AppStateProvider } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { SpeechProvider } from '../SpeechContext'
import { VoiceAnswer } from '../../components/speech/VoiceAnswer'
import { flush, RecognitionHarness, SynthHarness, V } from './fakes'

let rec: RecognitionHarness
let synth: SynthHarness
let forwarded: string[]

const YES_NO = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'unsure', label: 'I’m not sure' },
]
const AMOUNTS = [
  { id: 'profit', label: '₹300', amount: 300 },
  { id: 'sales', label: '₹1,000', amount: 1000 },
  { id: 'sum', label: '₹1,700', amount: 1700 },
  { id: 'unsure', label: 'I’m not sure' },
]
const SAV = [
  { id: 'mixed', label: 'Mixed with the shop cash' },
  { id: 'separate', label: 'Separately, like a savings box or bank account' },
]

function Harness({ options, lesson = true }: { options: typeof YES_NO; lesson?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <AppStateProvider store={new MemoryStore()}>
      <SpeechProvider stt={rec.service()} tts={synth.service()}>
        <VoiceAnswer options={options} questionText="Is your profit ₹500?" onConfirm={setPicked} onUnmatched={lesson ? (t) => forwarded.push(t) : undefined} />
        <output data-testid="picked">{picked ?? ''}</output>
      </SpeechProvider>
    </AppStateProvider>
  )
}
const say = async (transcript: string, options: typeof YES_NO, lesson = true) => {
  rec.script = { kind: 'result', transcript }
  render(<Harness options={options} lesson={lesson} />)
  await act(async () => {
    fireEvent.click(screen.getByTestId('stt-mic'))
    await flush()
  })
}
const confirmDisabled = () => (screen.getByTestId('stt-confirm') as HTMLButtonElement).disabled

beforeEach(() => {
  localStorage.clear()
  rec = new RecognitionHarness()
  synth = new SynthHarness([V.enIN, V.hiIN, V.teIN])
  forwarded = []
})
afterEach(cleanup)

describe('VoiceAnswer intent handling', () => {
  it('"I do not understand, please say it again" is a clarification request: question re-read, nothing selectable', async () => {
    await say('I do not understand, please say it again', YES_NO)
    expect(screen.getByTestId('stt-nomatch').dataset.kind).toBe('clarification_request')
    expect(confirmDisabled()).toBe(true)
    expect(synth.spoken.at(-1)?.text).toContain('Is your profit')
    expect(forwarded).toEqual(['I do not understand, please say it again']) // lesson AI may explain; still no answer
    expect(screen.getByTestId('picked').textContent).toBe('')
  })

  it('"Maybe 300, or maybe 1000" asks which amount, never picks one, and is not sent to the AI', async () => {
    await say('maybe 300, or maybe 1000', AMOUNTS)
    const msg = screen.getByTestId('stt-nomatch')
    expect(msg.dataset.kind).toBe('ambiguous_amount')
    expect(msg.textContent).toContain('₹300 / ₹1,000')
    expect(confirmDisabled()).toBe(true)
    expect(forwarded).toEqual([])
  })

  it('a bank account number is removed from the screen, never selectable, never sent', async () => {
    await say('my account number is 123456789012', SAV)
    expect(screen.getByTestId('stt-intent').dataset.kind).toBe('sensitive_information')
    expect(screen.queryByTestId('stt-transcript')).toBeNull()
    expect(document.body.textContent).not.toContain('123456789012')
    expect(forwarded).toEqual([])
  })

  it('an advice request gets the approved redirect and is not sent to the AI', async () => {
    await say('Should I put my savings in mutual funds instead?', SAV)
    expect(screen.getByTestId('stt-nomatch').dataset.kind).toBe('out_of_scope')
    expect(screen.getByTestId('stt-nomatch').textContent).toContain('ask your coach')
    expect(forwarded).toEqual([])
  })

  it('"six fifty"-style amounts are offered as a question ("Did you mean …?"), never as a plain match', async () => {
    const EXP = [
      { id: 'total', label: '₹650', amount: 650 },
      { id: 'stock_only', label: '₹600', amount: 600 },
    ]
    await say('six fifty', EXP)
    const m = screen.getByTestId('stt-match')
    expect(m.dataset.confidence).toBe('low')
    expect(m.textContent).toContain('Did you mean ₹650?')
    expect(screen.getByTestId('picked').textContent).toBe('') // only after she confirms
    cleanup()
    await say('six hundred fifty', EXP)
    expect(screen.getByTestId('stt-match').dataset.confidence).toBe('high')
  })

  it('"I\'m not sure" selects the respectful "not sure" option', async () => {
    await say("I'm not sure", AMOUNTS)
    expect(screen.getByTestId('stt-match').dataset.option).toBe('unsure')
  })

  it('a request for a simpler explanation on a check screen: question re-read SLOWLY, no explanation, nothing selectable', async () => {
    await say('Can you explain it in simpler words?', YES_NO, false)
    const msg = screen.getByTestId('stt-nomatch')
    expect(msg.dataset.kind).toBe('clarification_request')
    expect(msg.textContent).toContain('I can’t explain it here')
    const last = synth.spoken.at(-1)!
    expect(last.text).toContain('Is your profit')
    expect(last.rate).toBeLessThan(1)
    expect(confirmDisabled()).toBe(true)
  })

  it('in a lesson, a simplify request is passed to the lesson explainer (never scored)', async () => {
    await say('simple ga explain cheyyandi', YES_NO)
    expect(screen.getByTestId('stt-nomatch').textContent).toContain('more simply')
    expect(forwarded).toEqual(['simple ga explain cheyyandi'])
    expect(screen.getByTestId('picked').textContent).toBe('')
  })

  it('"मुझे नहीं पता" selects "not sure", never "No"', async () => {
    await say('मुझे नहीं पता', YES_NO)
    expect(screen.getByTestId('stt-match').dataset.option).toBe('unsure')
  })
})

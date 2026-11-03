// @vitest-environment jsdom
// Presentation demo (#/demo): real engine scoring, voice via the app's speech services (test doubles for the
// browser engines here), isolation from real learner data, and the four stages.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppStateProvider } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { SpeechProvider } from '../../speech/SpeechContext'
import { flush, RecognitionHarness, SynthHarness, V } from '../../speech/__tests__/fakes'
import { evidenceIsGrounded } from '../../coaching/model'
import { PresentationDemo } from '../PresentationDemo'
import { DEMO_STORAGE_KEY, coachGuidance, scoreDemo, type DemoAnswer } from '../demoModel'

const ans = (optionId: string, source: DemoAnswer['source'] = 'tap'): DemoAnswer => ({ optionId, source, lang: 'en', at: '2026-11-01T10:00:00.000Z', ...(source === 'voice' ? { transcript: optionId } : {}) })

describe('demo scoring uses the real engine and the recorded answer', () => {
  it('"Yes" → sales = profit misconception → Sales and profit, Foundational, R1, grounded evidence', () => {
    const o = scoreDemo(ans('yes', 'voice'))
    expect(o.scored.outcome).toEqual({ kind: 'misconception', code: 'misconception_revenue_vs_profit' })
    expect(o.result.recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', reason: 'misconception' })
    expect(o.level).toBe('foundational')
    expect(o.coaching).toMatchObject({ recommendedLessonId: 'revenue_vs_profit', recommendationRuleId: 'R1_MISCONCEPTION', misconceptionIds: ['misconception_revenue_vs_profit'], evidenceStrength: 'limited' })
    expect(o.coaching.supportingEvidence.filter((e) => e.kind === 'diagnostic')).toHaveLength(1) // nothing invented
    expect(o.coaching.supportingEvidence.some((e) => e.kind === 'lessonMiss' || e.kind === 'practiceMiss')).toBe(false)
    expect(evidenceIsGrounded(o.profile, o.coaching)).toBe(true)
    expect(o.amounts).toEqual({ sales: 500, cost: 300, left: 200 })
    const g = coachGuidance(o)
    expect(g.reinforce).toBe('Use a simple picture showing ₹500 in vegetable sales and ₹300 in the cost of vegetables sold. Ask Saraswathi how much remains after that cost, then discuss other expenses that may reduce profit.')
    expect(g.question).toBe('What are two expenses you pay to run your vegetable stall?')
  })
  it('"No" gives a different result: no misconception, next topic, level not determined', () => {
    const o = scoreDemo(ans('no'))
    expect(o.scored.outcome.kind).toBe('correct')
    expect(o.result.misconceptions).toEqual([])
    expect(o.result.recommendation.lessonId).toBe('business_expenses')
    expect(o.level).toBeNull()
    expect(o.coaching.misconceptionIds).toEqual([])
    expect(coachGuidance(o).misconception).toBeNull()
  })
  it('"Not sure" → Sales and profit, Foundational, without claiming a misconception', () => {
    const o = scoreDemo(ans('unsure'))
    expect(o.result.recommendation).toMatchObject({ lessonId: 'revenue_vs_profit', reason: 'unsure' })
    expect(o.result.misconceptions).toEqual([])
    expect(o.coaching.recommendationRuleId).toBe('R2_UNSURE')
  })
})

let rec: RecognitionHarness
let synth: SynthHarness
let realStore: MemoryStore
function Shell() {
  return (
    <AppStateProvider store={realStore}>
      <SpeechProvider stt={rec.service()} tts={synth.service()}>
        <MemoryRouter>
          <PresentationDemo />
        </MemoryRouter>
      </SpeechProvider>
    </AppStateProvider>
  )
}
const id = (t: string) => screen.getByTestId(t)
const click = async (el: HTMLElement) =>
  act(async () => {
    fireEvent.click(el)
    await flush()
  })
const say = async (words: string) => {
  rec.script = { kind: 'result', transcript: words }
  await click(id('stt-mic'))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  realStore = new MemoryStore()
  rec = new RecognitionHarness()
  synth = new SynthHarness([V.enIN, V.hiIN, V.teIN])
})
afterEach(cleanup)

describe('presentation demo flow', () => {
  it('shows six languages; English opens the question immediately and reads it and the choices aloud in English', async () => {
    render(<Shell />)
    for (const c of ['en', 'hi', 'te']) expect(id(`demo-lang-${c}`).dataset.preview).toBeUndefined()
    for (const c of ['bn', 'as', 'ta']) expect(id(`demo-lang-${c}`).textContent).toContain('Coming soon')
    expect(id('demo-lang-bn').textContent).toContain('বাংলা')
    expect(id('demo-lang-as').textContent).toContain('অসমীয়া')
    expect(id('demo-lang-ta').textContent).toContain('தமிழ்')
    await click(id('demo-lang-en'))
    expect(id('demo-stem').textContent).toBe('You sold ₹500 worth of vegetables today. Does that mean you made ₹500 in profit?')
    expect(id('demo-abbreviated')).toBeTruthy()
    await click(id('tts-play')) // browsers auto-read after the first tap; jsdom has no user-activation, so tap Listen
    await act(async () => {
      for (let i = 0; i < 20; i++) await flush()
    })
    const texts = synth.spoken.map((u) => u.text)
    expect(texts[0]).toContain('You sold 500 rupees worth of vegetables today') // the speech layer says ₹ as "rupees"
    expect(texts).toEqual(expect.arrayContaining(['Yes', 'No']))
    expect(synth.spoken.every((u) => u.lang === 'en-IN')).toBe(true)
  })

  it('voice "Yes" → shown as heard → Sales and profit → Coach View shows the same spoken answer as evidence', async () => {
    render(<Shell />)
    await click(id('demo-lang-en'))
    await say('yes')
    expect(id('stt-match').dataset.option).toBe('yes')
    await click(id('stt-confirm'))
    expect(id('demo-answer-source').dataset.source).toBe('voice')
    expect(id('demo-answer-source').textContent).toContain('Heard: “yes”')
    await click(id('demo-submit'))
    expect(id('demo-result').dataset.lesson).toBe('revenue_vs_profit')
    expect(id('demo-rec-level').dataset.level).toBe('foundational')
    expect(id('demo-rec-reason').textContent).toBe('Saraswathi’s response suggests she may be confusing total sales with profit.')
    expect(id('demo-tile-left').textContent).toContain('₹200')
    expect(id('demo-tile-left').textContent).toContain('before other expenses')
    await click(id('demo-to-coach'))
    expect(id('demo-coach').dataset.lesson).toBe('revenue_vs_profit')
    expect(id('demo-coach-lesson').textContent).toContain('Sales and profit — Foundational')
    expect(id('demo-evidence').dataset.option).toBe('yes')
    expect(id('demo-evidence').dataset.source).toBe('voice')
    expect(id('demo-evidence').textContent).toContain('Spoken: “yes”')
    expect(id('demo-misconception').textContent).toContain('did not account for business costs')
    expect(id('demo-coach-question').textContent).toContain('What are two expenses you pay to run your vegetable stall?')
  })

  it('"repeat" and "I don\'t understand" are not answers; "No" by voice gives a different result', async () => {
    render(<Shell />)
    await click(id('demo-lang-en'))
    const before = synth.spoken.length
    await say('repeat')
    expect(id('stt-nomatch')).toBeTruthy()
    expect((id('stt-confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(synth.spoken.length).toBeGreaterThan(before) // the question is read again
    expect((id('demo-submit') as HTMLButtonElement).disabled).toBe(true)
    rec.script = { kind: 'result', transcript: "I don't understand" }
    await click(id('stt-retry'))
    expect(screen.queryByTestId('stt-match')).toBeNull()
    expect(id('stt-nomatch')).toBeTruthy()
    expect((id('demo-submit') as HTMLButtonElement).disabled).toBe(true)
    rec.script = { kind: 'result', transcript: 'no' }
    await click(id('stt-retry'))
    expect(id('stt-match').dataset.option).toBe('no')
    await click(id('stt-confirm'))
    await click(id('demo-submit'))
    expect(id('demo-result').dataset.lesson).toBe('business_expenses')
    expect(id('demo-result').dataset.kind).toBe('correct')
    expect(id('demo-rec-level').dataset.level).toBe('none')
    await click(id('demo-to-coach'))
    expect(screen.queryByTestId('demo-misconception')).toBeNull()
  })

  it('microphone unavailable → clear notice and tap answers still work (labelled as tapped)', async () => {
    rec.script = { kind: 'error', error: 'not-allowed' }
    render(<Shell />)
    await click(id('demo-lang-en'))
    await click(id('stt-mic'))
    expect(screen.getByTestId('stt-fallback').dataset.reason).toBe('permission-denied')
    await click(id('option-yes'))
    expect(id('demo-answer-source').textContent).toContain('Tapped')
    await click(id('demo-submit'))
    await click(id('demo-to-coach'))
    expect(id('demo-evidence').textContent).toContain('Tapped (no voice used)')
  })

  it('reset returns to the start and never touches real learner data', async () => {
    render(<Shell />)
    const keys = () => realStore.keys().sort().join('|')
    const real = keys()
    const realDL01 = realStore.getItem('hisaab.progress.v1.learner.DL-01')
    await click(id('demo-lang-en'))
    await click(id('option-yes'))
    await click(id('demo-submit'))
    await click(id('demo-to-coach'))
    expect(sessionStorage.getItem(DEMO_STORAGE_KEY)).toContain('"stage":"coach"')
    await click(id('demo-reset'))
    expect(id('demo').dataset.stage).toBe('language')
    expect(sessionStorage.getItem(DEMO_STORAGE_KEY)).toContain('"answer":null')
    expect(keys()).toBe(real)
    expect(realStore.getItem('hisaab.progress.v1.learner.DL-01')).toBe(realDL01)
    expect(realStore.keys().some((k) => k.includes('PD-01'))).toBe(false)
  })

  it('stages 3 and 4 stay locked until an answer is submitted; navigation is one click after that', async () => {
    render(<Shell />)
    expect((id('demo-stage-result') as HTMLButtonElement).disabled).toBe(true)
    expect((id('demo-stage-coach') as HTMLButtonElement).disabled).toBe(true)
    await click(id('demo-lang-en'))
    await click(id('option-no'))
    await click(id('demo-submit'))
    await click(id('demo-stage-coach'))
    expect(id('demo').dataset.stage).toBe('coach')
    await click(id('demo-stage-question'))
    expect(id('demo').dataset.stage).toBe('question')
  })
})

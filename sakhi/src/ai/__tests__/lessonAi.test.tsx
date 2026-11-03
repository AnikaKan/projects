// @vitest-environment jsdom
// Lesson UI + AI explanations with a fake explain service (no network). Model replies are hand-written fixtures.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { SpeechProvider } from '../../speech/SpeechContext'
import { LessonRoute } from '../../learning/ui/LessonExperience'
import { MemoryStore } from '../../assessment/storage'
import { flush, RecognitionHarness, SynthHarness, V } from '../../speech/__tests__/fakes'
import { ExplainProvider } from '../AiContext'
import { approvedFallback } from '../fallback'
import type { ExplainContext, ExplainService } from '../explainClient'
import type { AiResponse, ExplainResult } from '../types'

let rec: RecognitionHarness
let app: ReturnType<typeof useApp>
let calls: ExplainContext[]
let next: (ctx: ExplainContext) => ExplainResult

const service: ExplainService = {
  async explain(ctx) {
    calls.push(ctx)
    return next(ctx)
  },
}
const claude = (displayText: string, patch: Partial<AiResponse> = {}) => (): ExplainResult => ({
  source: 'claude',
  response: { responseType: 'explanation', spokenText: displayText, displayText, conceptId: 'revenue_vs_profit', requiresClarification: false, suggestedNextAction: 'continue', ...patch },
})
const fallback = (reason: ExplainResult['reason']) => (ctx: ExplainContext): ExplainResult => ({
  source: 'fallback',
  reason,
  response: approvedFallback(ctx.content, ctx.state, ctx.lang, ctx.mode, reason),
})

function Spy() {
  app = useApp()
  return null
}
function Shell() {
  return (
    <AppStateProvider>
      <Spy />
      <SpeechProvider stt={rec.service()} tts={new SynthHarness([V.enIN, V.hiIN, V.teIN]).service()}>
        <ExplainProvider service={service}>
          <MemoryRouter initialEntries={['/lessons/m1']}>
            <Routes>
              <Route path="/lessons/:id" element={<LessonRoute store={new MemoryStore()} />} />
            </Routes>
          </MemoryRouter>
        </ExplainProvider>
      </SpeechProvider>
    </AppStateProvider>
  )
}
const step = () => screen.getByTestId('lesson').dataset.step
const tap = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el)
    await flush()
  })
}
const primary = () => tap(screen.getAllByTestId('primary')[0])
const goTo = async (n: number) => {
  render(<Shell />)
  await act(flush)
  for (let i = 0; i < n; i++) await primary()
}

beforeEach(() => {
  localStorage.clear()
  rec = new RecognitionHarness()
  calls = []
  next = fallback('not_configured')
})
afterEach(cleanup)

describe('AI explanation card in the lesson', () => {
  it('Claude explanation on the example step; a permitted "continue" becomes a normal NEXT button', async () => {
    next = claude('Out of ₹500, ₹300 went back to the mandi. ₹200 stays with you.')
    await goTo(2)
    expect(step()).toBe('example')
    await tap(screen.getByTestId('another-way'))
    const card = screen.getByTestId('ai-card')
    expect(card.dataset.source).toBe('claude')
    expect(screen.getByTestId('ai-text').textContent).toContain('₹200 stays with you')
    expect(card.textContent).toContain('Written by AI')
    expect(calls[0]).toMatchObject({ mode: 'explain', lang: 'en' })
    await tap(screen.getByTestId('ai-action'))
    expect(step()).toBe('response')
  })

  it('a suggestion the state machine does not allow is not offered (Claude cannot skip a question)', async () => {
    next = claude('Look at what you paid for the vegetables, then choose.', { suggestedNextAction: 'continue' })
    await goTo(3)
    expect(step()).toBe('response')
    await tap(screen.getByTestId('another-way'))
    expect(screen.getByTestId('ai-card').dataset.permitted).toBe('none')
    expect(screen.queryByTestId('ai-action')).toBeNull()
    expect(step()).toBe('response')
  })

  it('after a wrong answer, a suggested retry is allowed and dispatches RETRY through the machine', async () => {
    next = claude('₹500 is what customers gave you; ₹300 of it paid for vegetables.', { suggestedNextAction: 'retry' })
    await goTo(3)
    await tap(screen.getByTestId('option-sales'))
    await primary()
    expect(step()).toBe('feedback')
    await tap(screen.getByTestId('another-way'))
    expect(calls.at(-1)!.state.questions.response.attempts[0].optionId).toBe('sales')
    expect(screen.getByTestId('ai-action').dataset.action).toBe('retry')
    await tap(screen.getByTestId('ai-action'))
    expect(step()).toBe('response')
  })

  it('without Claude: intro shows the next APPROVED variant (no duplicate card); open questions show the approved rule', async () => {
    await goTo(1)
    expect(step()).toBe('intro')
    const before = screen.getByTestId('explanation').textContent
    await tap(screen.getByTestId('another-way'))
    expect(screen.getByTestId('explanation').textContent).not.toBe(before)
    expect(screen.queryByTestId('ai-card')).toBeNull()
    expect(screen.getByTestId('ai-hidden').dataset.reason).toBe('not_configured')
    await primary()
    await primary()
    expect(step()).toBe('response')
    await tap(screen.getByTestId('another-way'))
    const card = screen.getByTestId('ai-card')
    expect(card.dataset.source).toBe('fallback')
    expect(screen.getByTestId('ai-text').textContent).toBe('Remember: Profit = Sales − all costs')
    expect(card.textContent).not.toContain('Written by AI')
  })

  it('Hindi: the card shows the Devanagari response and is marked lang=hi', async () => {
    next = claude('₹500 आपकी बिक्री (sales) है। सब्ज़ियों के ₹300 देने के बाद ₹200 बचता है।')
    await goTo(0)
    act(() => app.setLang('hi'))
    await primary()
    await primary()
    await tap(screen.getByTestId('another-way'))
    expect(screen.getByTestId('ai-text').getAttribute('lang')).toBe('hi')
    expect(calls.at(-1)!.lang).toBe('hi')
  })

  it('unmatched spoken answer → interpret request with the learner’s words; nothing is selected or scored', async () => {
    next = claude('Do you mean the money customers gave you, or what stays after paying for the vegetables? Please choose below.', {
      responseType: 'clarification',
      requiresClarification: true,
      suggestedNextAction: 'repeat',
    })
    await goTo(3)
    rec.script = { kind: 'result', transcript: 'the money I keep for myself' }
    await tap(screen.getByTestId('stt-mic'))
    expect(screen.getByTestId('stt-nomatch')).toBeTruthy()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ mode: 'interpret', learnerText: 'the money I keep for myself' })
    const card = screen.getByTestId('ai-card')
    expect(card.dataset.type).toBe('clarification')
    expect(screen.queryByTestId('ai-action')).toBeNull()
    expect((screen.getAllByTestId('primary')[0] as HTMLButtonElement).disabled).toBe(true) // still no answer chosen
    expect(step()).toBe('response')
    // Editing the words does not send a new request on every keystroke.
    await act(async () => {
      fireEvent.change(screen.getByTestId('stt-transcript'), { target: { value: 'the money I keep' } })
      await flush()
    })
    expect(calls).toHaveLength(1)
  })

  it('a matched spoken answer never calls the AI', async () => {
    await goTo(3)
    rec.script = { kind: 'result', transcript: 'two hundred' }
    await tap(screen.getByTestId('stt-mic'))
    expect(screen.getByTestId('stt-match').dataset.option).toBe('left')
    expect(calls).toHaveLength(0)
  })

  it('demo offline mode uses approved content without calling the service', async () => {
    await goTo(3)
    act(() => app.setOffline(true))
    await tap(screen.getByTestId('another-way'))
    expect(screen.getByTestId('ai-card').dataset.reason).toBe('offline')
    expect(calls).toHaveLength(0)
  })
})

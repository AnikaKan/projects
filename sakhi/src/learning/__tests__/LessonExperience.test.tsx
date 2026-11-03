// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { LessonRoute } from '../ui/LessonExperience'
import { MemoryStore, saveRecord } from '../../assessment/storage'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../../assessment/engine'
import { ITEMS_BY_ID } from '../../assessment/bank'

let store: MemoryStore
let appSnapshot: ReturnType<typeof useApp> | null = null

function Spy() {
  appSnapshot = useApp()
  return null
}

function App() {
  return (
    <AppStateProvider>
      <Spy />
      <MemoryRouter initialEntries={['/lessons/m1']}>
        <Routes>
          <Route path="/lessons/:id" element={<LessonRoute store={store} />} />
          <Route path="/home" element={<div>HOME</div>} />
        </Routes>
      </MemoryRouter>
    </AppStateProvider>
  )
}

const step = () => screen.getByTestId('lesson').dataset.step
const primary = () => fireEvent.click(screen.getAllByTestId('primary')[0])
const choose = (id: string) => {
  fireEvent.click(screen.getByTestId(`option-${id}`))
  primary() // Check answer
}
const button = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const feedback = () => screen.getByTestId('feedback')

/** Seed the assessment result from the PRD demo: the learner said "Yes, ₹500 is my profit". */
function seedAssessmentMisconception() {
  let s = startAssessment({ learnerId: 'DL-01', business: 'vegetable', attempt: 1, now: 't' })
  for (let id = currentItemId(s); id; id = currentItemId(s)) {
    const opt = id === 'rvp_a_is_sales_profit' ? 'yes' : ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'correct')!.id
    s = submitAnswer(s, { itemId: id, optionId: opt, source: 'tap', lang: 'en', answeredAt: 't' }).session
  }
  saveRecord(store, 'DL-01', { schemaVersion: 1, inProgress: null, results: [finalize(s, { now: 't' })] })
}

beforeEach(() => {
  localStorage.clear()
  store = new MemoryStore()
  appSnapshot = null
})
afterEach(cleanup)

describe('Lesson experience — PRD demo (vegetable seller thinks ₹500 sales = ₹500 profit)', () => {
  it('incorrect → corrective → retry → correct pathway, through to completion', async () => {
    seedAssessmentMisconception()
    render(<App />)

    // 1. Assessment result names the misconception kindly
    expect(step()).toBe('assessment_result')
    expect(screen.getByTestId('result-message').textContent).toContain('all the sales money was counted as profit')
    primary()

    // 2. Intro with Repeat and Explain another way
    expect(step()).toBe('intro')
    const before = screen.getByTestId('explanation').textContent
    fireEvent.click(screen.getByTestId('another-way'))
    expect(screen.getByTestId('explanation').textContent).not.toBe(before)
    expect(screen.getByTestId('explanation').textContent).toContain('mandi') // vegetable-specific variant
    // jsdom has no speech engine and no backend: read-aloud shows its fallback notice instead of failing
    expect((await screen.findAllByTestId('tts-fallback'))[0].dataset.reason).toBe('no-voice')
    primary()

    // 3. Business example with visual amounts: ₹500 → ₹300 vegetables + ₹200 left
    expect(step()).toBe('example')
    expect(screen.getByTestId('explanation').textContent).toBe('You sold vegetables for ₹500. Those vegetables cost you ₹300 at the mandi. After paying for them, ₹200 is left.')
    expect(screen.getAllByTestId('seg-left')[0].textContent).toBe('₹200')
    expect(screen.getByTestId('seg-profit').textContent).toBe('₹130') // after spoilage ₹40 and auto ₹30
    primary()

    // 4–5. Learner says ₹500 → encouraging corrective feedback, no blame
    expect(step()).toBe('response')
    choose('sales')
    expect(step()).toBe('feedback')
    expect(feedback().dataset.tone).toBe('corrective')
    expect(feedback().textContent).toContain('Many sellers think this. ₹500 is your sales')
    expect(feedback().textContent).not.toMatch(/wrong|incorrect/i)
    fireEvent.click(screen.getByTestId('another-way'))
    expect(feedback().textContent).toContain('Think of it like this')
    button('Try again')

    // retry → positive
    expect(step()).toBe('response')
    choose('left')
    expect(feedback().dataset.tone).toBe('positive')
    expect(feedback().textContent).toContain('₹500 − ₹300 = ₹200')
    primary()

    // 6. Second scenario: forgets spoilage/auto first, then gets it
    expect(step()).toBe('practice')
    expect(screen.getByTestId('stem').textContent).toContain('Spoiled vegetables: ₹50')
    choose('goods_only')
    expect(feedback().textContent).toContain('Nearly there')
    button('Try again')
    choose('profit')
    expect(feedback().textContent).toContain('Your profit is ₹270')
    primary()

    // 7. Comprehension check (one try)
    expect(step()).toBe('check')
    choose('down')
    expect(feedback().dataset.tone).toBe('positive')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    primary()

    // 8. Weekly challenge
    expect(step()).toBe('challenge')
    expect(screen.getByTestId('challenge-text').textContent).toContain('mandi')
    button('I’ll do this')

    // 9. Completion — practice needed a retry, so "developing", not "understood"
    expect(step()).toBe('complete')
    const done = screen.getByTestId('completion')
    expect(done.dataset.result).toBe('developing')
    expect(done.dataset.resolved).toBe('misconception_revenue_vs_profit,misconception_ignores_hidden_costs')
    expect(done.dataset.open).toBe('')
    expect(appSnapshot!.completed).toContain('m1')
    // Practice needed a retry → practising (not "shown understanding"), and flagged for more practice.
    expect(appSnapshot!.mastery.m1).toBe('practicing')
    expect(appSnapshot!.progress.concepts.revenue_vs_profit.needsPractice).toBe(true)
    expect(appSnapshot!.progress.lessons.revenue_vs_profit).toMatchObject({ status: 'completed', starts: 1, completions: 1, lastResult: 'developing' })
    expect(appSnapshot!.challenge).toMatchObject({ status: 'assigned', challengeId: 'rvp.main', lessonId: 'revenue_vs_profit' })
  })

  it('all-correct pathway ends "understood" and records practising (never mastered)', () => {
    render(<App />)
    expect(screen.getByTestId('result-message').textContent).toContain('next lesson in your path')
    primary()
    primary()
    primary()
    choose('left')
    expect(screen.queryByTestId('another-way')).toBeNull() // no alternative explanation needed on positive feedback
    primary()
    choose('profit')
    primary()
    choose('down')
    primary()
    button('Not now')
    expect(screen.getByTestId('completion').dataset.result).toBe('understood')
    // Two independent first-try answers right → "shown understanding" (never "mastered").
    expect(appSnapshot!.mastery.m1).toBe('demonstrated')
    expect(appSnapshot!.challenge).toBeNull()
    expect(appSnapshot!.profile.events.some((e) => e.type === 'challenge_declined')).toBe(true)
  })

  it('incorrect pathway with no recovery ends "needs_review" and keeps misconceptions open', () => {
    render(<App />)
    primary()
    primary()
    primary()
    choose('sales')
    button('Try again')
    choose('added')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull() // attempts used up
    expect(feedback().parentElement!.textContent).toContain('profit = sales − costs')
    primary()
    choose('sales')
    button('Try again')
    choose('unsure')
    primary()
    choose('up')
    primary()
    button('I’ll do this')
    const done = screen.getByTestId('completion')
    expect(done.dataset.result).toBe('needs_review')
    expect(done.dataset.open).toContain('misconception_revenue_vs_profit')
  })
})

describe('resume, languages and personalisation', () => {
  it('an incomplete lesson resumes at the same step after leaving', () => {
    const first = render(<App />)
    primary()
    primary()
    primary()
    choose('sales')
    first.unmount()

    render(<App />)
    expect(screen.getByTestId('resume-body').textContent).toBe('You stopped at: Feedback')
    button('Continue')
    expect(step()).toBe('feedback')
    expect(feedback().dataset.tone).toBe('corrective')
    cleanup()

    render(<App />)
    button('Start again')
    expect(step()).toBe('assessment_result')
  })

  it('switching to Telugu mid-question keeps the step, selection and amounts', () => {
    render(<App />)
    primary()
    primary()
    primary()
    const enStem = screen.getByTestId('stem').textContent!
    fireEvent.click(screen.getByTestId('option-left'))
    fireEvent.click(screen.getByRole('button', { name: 'Language' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByText('తెలుగు'))
    expect(step()).toBe('response')
    const teStem = screen.getByTestId('stem').textContent!
    expect(teStem).toContain('కూరగాయల')
    expect(teStem.match(/₹[\d,]+/g)).toEqual(enStem.match(/₹[\d,]+/g))
    primary() // Check answer (selection survived the switch)
    expect(feedback().dataset.tone).toBe('positive')
    expect(feedback().textContent).toContain('₹500 − ₹300 = ₹200')
  })

  it('tea stall and grocery shop get their own examples and numbers', () => {
    const setup = render(<App />)
    act(() => appSnapshot!.setBusiness('tea'))
    setup.unmount()
    const tea = render(<App />)
    primary()
    primary()
    expect(screen.getByTestId('explanation').textContent).toContain('milk, tea leaves and sugar')
    expect(screen.getByText(/Gas for the stove/)).toBeTruthy()
    tea.unmount()

    act(() => appSnapshot!.setBusiness('grocery'))
    tea.unmount()
    render(<App />)
    primary()
    primary()
    expect(screen.getByTestId('explanation').textContent).toContain('stock you sold')
    expect(screen.getByText(/on udhaar/)).toBeTruthy()
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from '../../state/AppState'
import { AssessmentFlow } from '../ui/AssessmentFlow'
import { RecommendationScreen } from '../ui/RecommendationScreen'
import { MemoryStore } from '../storage'
import { ITEMS_BY_ID } from '../bank'

let store: MemoryStore

function App() {
  return (
    <AppStateProvider>
      <MemoryRouter initialEntries={['/assessment']}>
        <Routes>
          <Route path="/assessment" element={<AssessmentFlow store={store} />} />
          <Route path="/assessment/result" element={<RecommendationScreen store={store} />} />
          <Route path="/home" element={<div>HOME</div>} />
          <Route path="/lessons/:id" element={<div>LESSON</div>} />
        </Routes>
      </MemoryRouter>
    </AppStateProvider>
  )
}

const primary = () => screen.getAllByTestId('primary').at(0)!
const tapOption = (id: string) => fireEvent.click(screen.getByTestId(`option-${id}`))
const stem = () => screen.getByTestId('stem').textContent!
const currentItemFromStorage = () => {
  const rec = JSON.parse(store.getItem('hisaab.assessment.v1.DL-01')!)
  return rec.inProgress.itemIds[rec.inProgress.answers.length] as string
}
const correctOf = (id: string) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'correct')!.id
const misOf = (id: string) => ITEMS_BY_ID[id].options.find((o) => o.outcome.kind === 'misconception')!.id

function answerCurrent(choose: (id: string) => string) {
  tapOption(choose(currentItemFromStorage()))
  fireEvent.click(primary()) // Confirm answer
  fireEvent.click(primary()) // Next question / See my starting lesson
}

function switchLanguage(native: string) {
  fireEvent.click(screen.getByRole('button', { name: /Language|भाषा|భాష/ }))
  fireEvent.click(within(screen.getByRole('dialog')).getByText(native))
}

beforeEach(() => {
  localStorage.clear()
  store = new MemoryStore()
})
afterEach(cleanup)

describe('AssessmentFlow UI', () => {
  it('shows one question at a time, gives non-critical feedback and ends on a personalised recommendation', () => {
    render(<App />)
    fireEvent.click(primary()) // Start
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    expect(stem()).toContain('vegetables') // default business

    // Example 1 from the brief: "Yes" is a misconception
    tapOption('yes')
    fireEvent.click(primary())
    const fb = screen.getByTestId('feedback')
    expect(fb.dataset.outcome).toBe('misconception')
    expect(fb.textContent).toContain('Many shop owners think this too.')
    expect(fb.textContent).not.toMatch(/wrong|incorrect/i)
    expect(fb.textContent).toContain('₹500 − ₹300 = ₹200')
    fireEvent.click(primary())

    for (let i = 0; i < 4; i++) answerCurrent(correctOf)
    const rec = screen.getByTestId('recommendation')
    expect(rec.dataset.lesson).toBe('revenue_vs_profit')
    expect(rec.dataset.reason).toBe('misconception')
    expect(screen.getByTestId('level-revenue_vs_profit').dataset.level).toBe('gap')
    expect(screen.getByTestId('level-customer_credit').dataset.level).toBe('emerging') // never "mastered"
  })

  it('switching language mid-assessment keeps the position, the answer and the numbers', () => {
    render(<App />)
    fireEvent.click(primary())
    answerCurrent(correctOf) // Q1
    expect(screen.getByText('Question 2 of 5')).toBeTruthy()
    tapOption('stock') // pending selection on Q2 (business expenses)

    switchLanguage('తెలుగు')
    expect(screen.getByText('ప్రశ్న 2 / 5')).toBeTruthy()
    expect(stem()).toBe('వీటిలో వ్యాపార ఖర్చు ఏది?')
    fireEvent.click(primary()) // confirm the pending answer, now in Telugu
    expect(screen.getByTestId('feedback').dataset.outcome).toBe('correct')
    fireEvent.click(primary())

    // Q3 numbers are identical in Hindi and English
    switchLanguage('हिन्दी')
    const hiAmounts = stem().match(/₹[\d,]+/g)
    switchLanguage('English')
    expect(stem().match(/₹[\d,]+/g)).toEqual(hiAmounts)
  })

  it('an incomplete assessment can be resumed after leaving, or restarted', () => {
    const first = render(<App />)
    fireEvent.click(primary())
    answerCurrent(correctOf)
    answerCurrent(misOf)
    first.unmount()

    render(<App />)
    expect(screen.getByText('Continue where you left off?')).toBeTruthy()
    expect(screen.getByText('You answered 2 of 5 questions.')).toBeTruthy()
    fireEvent.click(screen.getByText('Continue'))
    expect(screen.getByText('Question 3 of 5')).toBeTruthy()
    cleanup()

    render(<App />)
    fireEvent.click(screen.getByText('Start again'))
    expect(screen.getByText('Question 1 of 5')).toBeTruthy()
    expect(JSON.parse(store.getItem('hisaab.assessment.v1.DL-01')!).inProgress.answers).toHaveLength(0)
  })

  it('two tiers: 5 foundational questions; all right → "well done" + 3 harder ones → intermediate level; a retake uses applied questions', async () => {
    render(<App />)
    fireEvent.click(primary())
    for (let i = 0; i < 5; i++) answerCurrent(correctOf)
    expect(screen.getByTestId('tier-unlocked').dataset.more).toBe('3')
    fireEvent.click(screen.getByTestId('unlock-continue'))
    expect(screen.getByText('Question 6 of 8')).toBeTruthy()
    for (let i = 0; i < 3; i++) answerCurrent(correctOf)
    expect(screen.getByTestId('recommendation').dataset.reason).toBe('next_in_path')
    expect(screen.getByTestId('tier').dataset.tier).toBe('intermediate')
    const saved = JSON.parse(store.getItem('hisaab.assessment.v1.DL-01')!)
    expect(saved.results).toHaveLength(1)
    expect(saved.results[0].answers).toHaveLength(8)

    await act(async () => fireEvent.click(screen.getByText('Answer new questions')))
    fireEvent.click(primary())
    const retry = JSON.parse(store.getItem('hisaab.assessment.v1.DL-01')!).inProgress
    expect(retry.mode).toBe('applied')
    expect(retry.itemIds.every((id: string) => ITEMS_BY_ID[id].form === 'B')).toBe(true)
  })

  it('struggling on the foundational round stops after 5 questions at the foundational level', () => {
    render(<App />)
    fireEvent.click(primary())
    for (let i = 0; i < 5; i++) answerCurrent(misOf)
    expect(screen.queryByTestId('tier-unlocked')).toBeNull()
    expect(screen.getByTestId('tier').dataset.tier).toBe('foundational')
    expect(screen.getByTestId('recommendation').dataset.lesson).toBe('revenue_vs_profit')
  })
})

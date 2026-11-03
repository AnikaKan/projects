// @vitest-environment jsdom
// Coach View through the real screens, the real repository and fictional demo learners.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { CoachView } from '../CoachView'
import { HomeScreen } from '../../screens/Home'
import { LessonRoute } from '../../learning/ui/LessonExperience'
import { LocalProgressRepository } from '../../progress/repository'
import { deriveProgress } from '../../progress/engine'

let store: MemoryStore
let app: ReturnType<typeof useApp>
let clock = '2026-11-01T10:00:00.000Z'
function Spy() {
  app = useApp()
  return null
}
function Shell({ path }: { path: string }) {
  return (
    <AppStateProvider store={store} clock={() => clock}>
      <Spy />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/lessons/:id" element={<LessonRoute />} />
          <Route path="/assessment" element={<div data-testid="assessment-page" />} />
          <Route path="/coach" element={<CoachView />} />
          <Route path="/coach/learner/:id" element={<CoachView />} />
          <Route path="/coach/learner/:id/session" element={<CoachView session />} />
        </Routes>
      </MemoryRouter>
    </AppStateProvider>
  )
}
const click = (el: HTMLElement) => act(() => void fireEvent.click(el))
const id = (t: string) => screen.getByTestId(t)
const stored = (lid: string) => new LocalProgressRepository(store).get(lid)!

beforeEach(() => {
  localStorage.clear()
  store = new MemoryStore()
  clock = '2026-11-01T10:00:00.000Z'
})
afterEach(cleanup)

describe('Coach home', () => {
  it('shows the four counts and lists learners who need attention first, each with business, language, topic, level and status', () => {
    render(<Shell path="/coach" />)
    expect(id('stat-all').dataset.count).toBe('6')
    expect(id('stat-attention').dataset.count).toBe('5')
    expect(id('stat-challenges').dataset.count).toBe('3')
    expect(id('stat-ready').dataset.count).toBe('2')
    const rows = screen.getAllByTestId(/^roster-DL-\d+$/)
    const statuses = rows.map((r) => r.dataset.status)
    expect(statuses.indexOf('doingWell')).toBe(statuses.length - 1) // most urgent first
    const kavitha = id('roster-DL-06')
    expect(kavitha.textContent).toContain('Kavitha')
    expect(kavitha.textContent).toContain('Grocery shop · తెలుగు')
    expect(kavitha.textContent).toContain('Everyday costs')
    expect(kavitha.textContent).toContain('Intermediate')
    expect(kavitha.textContent).toContain('Doing well')
    expect(id('roster-reason-DL-03').textContent).toBe('Activity not checked yet')
  })
  it('a count filters the list', () => {
    render(<Shell path="/coach" />)
    click(id('stat-ready'))
    expect(screen.getAllByTestId(/^roster-DL-\d+$/).map((r) => r.dataset.testid)).toEqual(['roster-DL-04', 'roster-DL-06'])
    click(id('filter-clear'))
    expect(screen.getAllByTestId(/^roster-DL-\d+$/)).toHaveLength(6)
  })
})

describe('Learner profile and "Why this lesson?"', () => {
  it('Saraswathi: recommendation, coaching action and evidence from HER saved answers', () => {
    render(<Shell path="/coach/learner/DL-02" />)
    const r = id('coach-recommended')
    expect(r.dataset).toMatchObject({ lesson: 'revenue_vs_profit', level: 'foundational', rule: 'R2B_IN_PROGRESS' })
    expect(id('rec-action-text').textContent).toBe('Help Saraswathi see that selling ₹500 of vegetables does not mean she earned ₹500 in profit.')
    expect(screen.queryByTestId('why-panel')).toBeNull() // optional: hidden until asked
    click(id('why-toggle'))
    const items = within(id('why-evidence')).getAllByRole('listitem')
    expect(items.length).toBeLessThanOrEqual(3)
    expect(items[0].textContent).toContain('she answered “Yes”')
    expect(items[1].textContent).toContain('Counts all sales money as profit')
    expect(id('why-learn').textContent).toBe('Sales are not the same as profit. The cost of the goods must come out first.')
    expect(id('why-priority').textContent).toContain('Everyday costs')
  })
  it('limited evidence is said plainly', () => {
    render(<Shell path="/coach/learner/DL-03" />)
    click(id('why-toggle'))
    expect(id('why-insufficient').textContent).toContain('Recommended based on the initial assessment. More practice is needed to understand this learning need.')
  })
  it('a new learner without a first check gets an honest explanation and a "start the check" action', () => {
    render(<Shell path="/coach/learner/DL-01" />)
    expect(id('profile-level').dataset.level).toBe('none')
    expect(id('rec-action-text').textContent).toContain('5-question first check')
    click(id('why-toggle'))
    expect(id('why-headline').textContent).toBe('No first check yet, so there is no learning history to explain.')
  })
  it('accept is saved; the explanation keeps its meaning in Telugu and Hindi', () => {
    render(<Shell path="/coach/learner/DL-02" />)
    click(id('accept-rec'))
    expect(stored('DL-02').events.at(-1)).toMatchObject({ type: 'coach_accepted', lessonId: 'revenue_vs_profit', ruleId: 'R2B_IN_PROGRESS' })
    expect((id('accept-rec') as HTMLButtonElement).disabled).toBe(true)
    click(id('why-toggle'))
    const n = within(id('why-evidence')).getAllByRole('listitem').length
    click(id('coach-lang-te'))
    expect(within(id('why-evidence')).getAllByRole('listitem')).toHaveLength(n)
    expect(id('why-evidence').textContent).toMatch(/₹500.*₹300/)
    expect(id('rec-action-text').textContent).toContain('సరస్వతి')
    click(id('coach-lang-hi'))
    expect(id('rec-action-text').textContent).toContain('सरस्वती')
  })
  it('changing the difficulty level needs a reason and is saved', () => {
    render(<Shell path="/coach/learner/DL-02" />)
    click(id('coach-adjust'))
    click(id('adjust-level-intermediate'))
    expect((id('adjust-save') as HTMLButtonElement).disabled).toBe(true)
    click(id('adjust-reason-alreadyKnows'))
    click(id('adjust-save'))
    expect(stored('DL-02').events.at(-1)).toMatchObject({ type: 'coach_level_set', level: 'intermediate', reason: 'showedUnderstanding' })
    expect(id('coach-recommended').dataset.level).toBe('intermediate')
    expect(id('level-source').dataset.source).toBe('coach')
  })
  it('weekly activity: "done" asks the coach to check understanding; the check is saved', () => {
    clock = '2026-11-01T10:00:00.000Z'
    render(<Shell path="/coach/learner/DL-03" />)
    act(() => void app.coachCheckIn('DL-03', 'DL-03-ch1', 'done', []))
    expect(id('challenge-DL-03-ch1').dataset.display).toBe('completed')
    expect(id('challenge-followup').dataset.rule).toBe('F2_VERIFY')
    expect(id('challenge-followup').textContent).toContain('Ask Sunita to explain')
    click(id('verify-explained'))
    expect(id('verify-box').dataset.verified).toBe('explained')
    expect(id('challenge-followup').dataset.rule).toBe('F3_EXPLAINED')
  })
  it('notes: categories and short text are saved; personal data is refused', () => {
    render(<Shell path="/coach/learner/DL-05" />)
    click(id('add-note'))
    click(id('note-cat-appDifficulty'))
    act(() => void fireEvent.change(id('note-text'), { target: { value: 'Phone 9876543210' } }))
    click(id('note-save'))
    expect(id('note-error')).toBeTruthy()
    act(() => void fireEvent.change(id('note-text'), { target: { value: 'Needed help with the mic' } }))
    click(id('note-save'))
    expect(stored('DL-05').events.at(-1)).toMatchObject({ type: 'coach_note', categories: ['appDifficulty'], text: 'Needed help with the mic' })
    expect(id('notes-list').textContent).toContain('Difficulty using the app')
  })
})

describe('Guided coaching session', () => {
  it('runs all five steps for Sunita, records everything to her progress, and completes', () => {
    render(<Shell path="/coach/learner/DL-03/session" />)
    const before = deriveProgress(stored('DL-03'))
    expect(id('coach-session').dataset.step).toBe('checkin')
    // 1 · Check in: the activity text is in HER language (Hindi)
    expect(id('step-checkin').textContent).toContain('शाम')
    click(id('session-ci-notYet'))
    click(id('session-diff-noTime'))
    click(id('session-ci-save'))
    expect(id('session-ci-saved').textContent).toContain('Not completed')
    click(id('session-next'))
    // 2 · Review: the open misconception, the idea in her language
    expect(id('step-review').dataset.mis).toBe('misconception_mixes_business_household')
    expect(id('review-learn').getAttribute('lang')).toBe('hi')
    click(id('session-next'))
    // 3 · Teach: Two pockets has no in-app lesson yet → said honestly, with the activity
    expect(id('teach-no-content')).toBeTruthy()
    click(id('session-next'))
    // 4 · Practice: approved question of her level; wrong first, then right
    const opts = within(id('step-practice')).getAllByTestId(/^practice-opt-/)
    const wrong = opts.find((o) => o.dataset.outcome !== 'correct')!
    click(wrong)
    expect(id('practice-feedback').dataset.outcome).not.toBe('correct')
    click(id('practice-retry'))
    click(within(id('step-practice')).getAllByTestId(/^practice-opt-/).find((o) => o.dataset.outcome === 'correct')!)
    expect(id('practice-feedback').dataset.outcome).toBe('correct')
    click(id('session-next'))
    // 5 · Action: the smaller version of last week's activity is suggested; agree it; add a note
    click(id('action-agree-rvp.oneEvening'))
    expect(id('action-agreed').dataset.challenge).toBe('rvp.oneEvening')
    click(within(id('session-note')).getByTestId('note-cat-needsPractice'))
    click(within(id('session-note')).getByTestId('note-save'))
    expect(id('session-recorded').textContent).toMatch(/Activity checked.*Practice: 1 of 2 right.*New activity agreed.*Note saved/)
    click(id('session-complete'))
    expect(id('session-done')).toBeTruthy()
    const after = deriveProgress(stored('DL-03'))
    expect(after.sessions.count).toBe(2) // seeded session + this coaching session
    expect(after.practice.bySource.practice).toBe(before.practice.bySource.practice + 2)
    expect(after.activeChallenge).toMatchObject({ challengeId: 'rvp.oneEvening', followUpOf: 'DL-03-ch1' })
    expect(after.challenges[0].status).toBe('notYet')
    expect(stored('DL-03').events.some((e) => e.type === 'coach_session_completed')).toBe(true)
  })

  it('the practice question stays fixed for the session even when her answer changes the next recommendation', () => {
    render(<Shell path="/coach/learner/DL-05/session" />)
    click(id('session-go-practice'))
    const q = id('step-practice').dataset.question
    expect(q).toBe('calc:business_expenses:intermediate')
    click(within(id('step-practice')).getAllByTestId(/^practice-opt-/).find((o) => o.dataset.outcome === 'correct')!)
    expect(id('step-practice').dataset.question).toBe(q)
    expect(id('practice-feedback').dataset.outcome).toBe('correct')
  })

  it('can be paused and resumed at the same step', () => {
    render(<Shell path="/coach/learner/DL-02/session" />)
    click(id('session-go-practice'))
    expect(id('coach-session').dataset.step).toBe('practice')
    click(id('session-pause'))
    expect(id('learner-detail')).toBeTruthy()
    expect(id('start-session').dataset.resume).toBe('true')
    expect(id('start-session').textContent).toContain('step 4 of 5')
    expect(id('roster-reason-DL-02')).toBeTruthy()
    cleanup()
    render(<Shell path="/coach/learner/DL-02" />) // e.g. next day, app reopened
    click(id('start-session'))
    expect(id('coach-session').dataset.step).toBe('practice')
    expect(stored('DL-02').events.filter((e) => e.type === 'coach_session_started')).toHaveLength(1)
  })

  it('learner-facing content follows her language and can be switched, without changing her saved language or progress', () => {
    render(<Shell path="/coach/learner/DL-02/session" />)
    click(id('session-go-practice'))
    expect(id('practice-text').getAttribute('lang')).toBe('te')
    expect(id('practice-text').textContent).toContain('₹1,500') // vegetable stall, foundational: two numbers
    click(id('session-lang-en'))
    expect(id('practice-text').textContent).toBe('Sales ₹1,500. Stock ₹900. How much is left for you?')
    click(id('session-go-teach'))
    expect(id('lesson-review').dataset.playLang).toBe('en')
    expect(id('review-prevExample').textContent).toContain('You sold vegetables for ₹500')
    expect(within(id('lesson-review')).getAllByTestId(/tts-|tts-fallback/).length).toBeGreaterThan(0) // replay audio controls
    expect(stored('DL-02').language).toBe('te')
  })

  it('"Open the lesson" hands the phone to that learner and keeps the session to resume', () => {
    render(<Shell path="/coach/learner/DL-02/session" />)
    click(id('session-go-teach'))
    click(id('teach-open-lesson'))
    expect(app.learnerId).toBe('DL-02')
    expect(screen.queryByTestId('lesson') ?? screen.getByTestId('resume-body')).toBeTruthy() // her unfinished lesson, ready to resume
    const s = stored('DL-02').events.filter((e) => e.type === 'coach_session_paused')
    expect(s).toHaveLength(1)
  })
})

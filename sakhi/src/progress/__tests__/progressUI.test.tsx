// @vitest-environment jsdom
// Learner progress, weekly-challenge check-in and Coach View, through the real screens and the real repository.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { MemoryStore } from '../../assessment/storage'
import { HomeScreen } from '../../screens/Home'
import { JourneyScreen } from '../../screens/Journey'
import { CheckInScreen } from '../../screens/CheckIn'
import { PracticeQuestion } from '../../screens/Practice'
import { CoachView } from '../../coach/CoachView'
import { LessonRoute } from '../../learning/ui/LessonExperience'
import { LocalProgressRepository } from '../repository'

let store: MemoryStore
let app: ReturnType<typeof useApp>
function Spy() {
  app = useApp()
  return null
}
function Shell({ path }: { path: string }) {
  return (
    <AppStateProvider store={store}>
      <Spy />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/home" element={<HomeScreen />} />
          <Route path="/journey" element={<JourneyScreen />} />
          <Route path="/checkin" element={<CheckInScreen />} />
          <Route path="/practice/:id" element={<PracticeQuestion />} />
          <Route path="/practice" element={<div>PRACTICE LIST</div>} />
          <Route path="/lessons" element={<div>LESSONS</div>} />
          <Route path="/lessons/:id" element={<LessonRoute />} />
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

beforeEach(() => {
  localStorage.clear()
  store = new MemoryStore()
})
afterEach(cleanup)

describe('weekly challenge check-in (learner)', () => {
  it('next session: Home asks about last week’s activity; "not yet" + difficulty → supportive message and smaller follow-up', () => {
    render(<Shell path="/coach" />)
    act(() => app.startSession('DL-03')) // coach hands the phone to the learner (new session)
    cleanup()
    render(<Shell path="/home" />)
    expect(app.learnerId).toBe('DL-03')
    expect(app.lang).toBe('hi')
    expect(id('home-checkin').textContent).toContain('पिछले हफ़्ते का काम')
    cleanup()

    render(<Shell path="/checkin" />)
    click(id('ci-notYet'))
    click(id('diff-noTime'))
    click(id('diff-forgot'))
    // A phone number in the note is refused and nothing is saved
    act(() => void fireEvent.change(id('ci-note'), { target: { value: 'mera number 98765 43210' } }))
    click(id('ci-send'))
    expect(id('ci-note-error').textContent).toContain('सेव नहीं किया')
    expect(app.progress.activeChallenge?.status).toBe('assigned')
    act(() => void fireEvent.change(id('ci-note'), { target: { value: 'shaadi thi' } }))
    click(id('ci-send'))
    expect(id('ci-message').dataset.key).toBe('ci.msg.notYetBusy')
    expect(id('ci-message').textContent).toContain('कोई बात नहीं')
    expect(id('ci-followup').dataset.challenge).toBe('rvp.oneEvening')
    click(id('ci-accept'))
    expect(id('ci-saved')).toBeTruthy()
    const v = app.progress
    expect(v.challenges.map((c) => [c.challengeId, c.status])).toEqual([
      ['rvp.main', 'notYet'],
      ['rvp.oneEvening', 'assigned'],
    ])
    expect(v.challenges[0].checkIn).toMatchObject({ difficulties: ['noTime', 'forgot'], note: 'shaadi thi' })
    expect(v.checkInDue).toBe(false)
  })

  it('"not sure what to do" offers an easier activity and a lesson replay; "not now" assigns nothing', () => {
    render(<Shell path="/coach" />)
    act(() => app.startSession('DL-03')) // coach hands the phone to the learner (new session)
    cleanup()
    render(<Shell path="/checkin" />)
    click(id('ci-partly'))
    click(id('diff-notClear'))
    click(id('ci-send'))
    expect(id('ci-message').dataset.key).toBe('ci.msg.notYetUnclear')
    expect(id('ci-followup').dataset.challenge).toBe('rvp.explain')
    expect(id('ci-replay')).toBeTruthy()
    click(id('ci-notnow'))
    expect(app.progress.activeChallenge).toBeNull()
    expect(app.progress.challenges[0].status).toBe('partly')
  })
})

describe('learner progress screens', () => {
  it('My Journey (merged Practice + Progress) shows introduced / practising / needs practice, and language switching keeps every level', () => {
    render(<Shell path="/coach" />)
    act(() => app.startSession('DL-05')) // coach hands the phone to the learner (new session)
    cleanup()
    render(<Shell path="/journey" />)
    const levels = () => ['m1', 'm2', 'm3', 'm4', 'm5'].map((m) => [id(`prog-${m}`).dataset.level, id(`prog-${m}`).dataset.needsPractice])
    const before = levels()
    expect(before[0]).toEqual(['practicing', 'true'])
    expect(id('prog-m1').textContent).toContain('Needs more practice')
    act(() => app.setLang('te'))
    expect(levels()).toEqual(before)
    expect(id('prog-m1').textContent).toContain('ఇంకా సాధన కావాలి')
    act(() => app.setLang('hi'))
    expect(levels()).toEqual(before)
    expect(screen.getAllByTestId('prog-challenge').map((e) => e.dataset.status)).toEqual(['assigned', 'notYet'])
  })

  it('an unfinished lesson is offered for resume at the step where she stopped', () => {
    render(<Shell path="/coach" />)
    act(() => app.startSession('DL-02')) // coach hands the phone to the learner (new session)
    cleanup()
    render(<Shell path="/home" />)
    expect(id('home-resume-card').textContent).toContain('ఇక్కడ ఆగారు') // Telugu: "you stopped at"
    click(screen.getAllByTestId('primary')[0]) // Continue your lesson
    expect(screen.getByTestId('resume-body')).toBeTruthy()
    click(screen.getAllByTestId('primary')[0]) // resume
    expect(id('lesson').dataset.step).toBe('practice')
  })

  it('a practice answer is saved to progress', () => {
    render(<Shell path="/practice/m1" />)
    const before = app.progress.practice.bySource.practice
    // Tiered practice (2026-11-01): a new learner first gets the easy two-number question (₹1,500 − ₹900 = ₹600)…
    expect(screen.getByTestId('stem').dataset.tier).toBe('foundational')
    click(screen.getByText('₹600'))
    click(screen.getAllByTestId('primary')[0]) // check → correct
    expect(app.progress.practice.bySource.practice).toBe(before + 1)
    click(screen.getAllByTestId('primary')[0]) // next question
    // …then the harder one with ₹100 spoiled goods, where ₹600 forgets the waste.
    expect(screen.getByTestId('stem').dataset.tier).toBe('intermediate')
    click(screen.getByText('₹600'))
    click(screen.getAllByTestId('primary')[0])
    expect(app.progress.practice.bySource.practice).toBe(before + 2)
    expect(app.progress.misconceptions.find((m) => m.code === 'misconception_ignores_hidden_costs')?.resolved).toBe(false)
  })
})

describe('Coach View (coaching assistant)', () => {
  it('is clearly labelled as a prototype with fictional learners, and shows every section for that learner', () => {
    render(<Shell path="/coach/learner/DL-04" />)
    expect(id('prototype-banner').textContent).toMatch(/PROTOTYPE.*fictional/)
    expect(screen.getAllByTestId(/^roster-DL-\d+$/)).toHaveLength(6)
    const d = id('learner-detail')
    expect(within(d).getByTestId('coach-profile').textContent).toContain('Fictional demo learner · DL-04')
    for (const t of ['coach-recommended', 'coach-challenges', 'coach-progress', 'coach-level', 'coach-notes', 'coach-log', 'start-session']) expect(within(d).getByTestId(t)).toBeTruthy()
    expect(id('lesson-m1').dataset.status).toBe('completed')
    expect(id('concept-m1').dataset.level).toBe('demonstrated')
    expect(id('mis-misconception_credit_as_cash').dataset.resolved).toBe('false')
    expect(id('coach-assessment').dataset.tier).toBe('intermediate')
    expect(id('coach-recommended').dataset.source).toBe('coach')
    expect(id('coach-recommended').textContent).toContain('Changed by coach')
    expect(id('coach-recommended').textContent).toContain('App suggested: Customer credit')
  })

  it('coach changes the next lesson with a required reason; the change is logged and visible on the list', () => {
    render(<Shell path="/coach/learner/DL-03" />)
    expect(id('coach-recommended').dataset.lesson).toBe('business_household_separation')
    click(id('coach-adjust'))
    click(id('adjust-to-business_expenses'))
    expect((id('adjust-save') as HTMLButtonElement).disabled).toBe(true) // reason required
    click(id('adjust-reason-shortOnTime'))
    act(() => void fireEvent.change(id('adjust-note'), { target: { value: 'Account 123456789012' } }))
    click(id('adjust-save'))
    expect(id('adjust-error')).toBeTruthy() // personal data refused, nothing saved
    expect(id('coach-recommended').dataset.source).toBe('rules')
    act(() => void fireEvent.change(id('adjust-note'), { target: { value: 'Only 10 minutes today' } }))
    click(id('adjust-save'))
    expect(id('coach-recommended').dataset.lesson).toBe('business_expenses')
    expect(id('coach-recommended').dataset.source).toBe('coach')
    expect(id('coach-recommended').dataset.rule).toBe('C1_COACH_CHOICE')
    expect(id('coach-log').textContent).toContain('Short session today')
    expect(id('roster-next-DL-03').textContent).toContain('Everyday costs')
    const stored = new LocalProgressRepository(store).get('DL-03')!
    expect(stored.events.at(-1)).toMatchObject({ type: 'coach_override', toLessonId: 'business_expenses', reason: 'shortOnTime', note: 'Only 10 minutes today', ruleId: 'R1_MISCONCEPTION' })
    // The original diagnostic evidence is untouched and still explained.
    click(id('why-toggle'))
    expect(id('why-headline').textContent).toContain('The app suggested Two pockets')
    expect(id('why-headline').textContent).toContain('Mixes shop money and home money')
  })

  it('works in Hindi and Telugu; the coach language never changes the learner language', () => {
    render(<Shell path="/coach/learner/DL-03" />)
    click(id('coach-lang-te'))
    expect(id('prototype-banner').textContent).toContain('ప్రోటోటైప్')
    expect(id('coach-recommended').textContent).toContain('ఈ రోజు దేనిపై పని చేద్దాం?')
    click(id('coach-lang-hi'))
    expect(id('coach-recommended').textContent).toContain('आज किस पर काम करें?')
    expect(id('coach-learner-lang').textContent).toBe('हिन्दी')
    expect(app.lang).toBe('en') // DL-01 active learner untouched
    expect(app.profile.events.some((e) => e.type === 'language_changed')).toBe(false)
  })

  it('preview languages are shown as coming soon and never switch the Coach View language', () => {
    render(<Shell path="/coach" />)
    click(id('coach-lang-more'))
    click(id('coach-lang-soon-ta'))
    expect(id('coach-lang-soon-note').textContent).toContain('தமிழ்: coming soon')
    expect(app.coachLang).toBe('en')
    expect(id('coach-lang-soon-bn').textContent).toContain('বাংলা')
    expect(id('coach-lang-soon-as').textContent).toContain('অসমীয়া')
  })

  it('updates when the learner makes progress in her app (check-in recorded → coach sees it)', () => {
    render(<Shell path="/coach/learner/DL-03" />)
    expect(id('challenge-DL-03-ch1').dataset.display).toBe('notChecked')
    act(() => app.startSession('DL-03'))
    cleanup()
    render(<Shell path="/checkin" />)
    click(id('ci-done'))
    click(id('ci-accept'))
    cleanup()
    render(<Shell path="/coach/learner/DL-03" />)
    expect(id('challenge-DL-03-ch1').dataset.display).toBe('completed')
    expect(id('challenge-followup').dataset.rule).toBe('F2_VERIFY') // done ≠ understood: coach asked to check
    expect(id('challenge-next').dataset.agreed).toBe('true')
  })

  it('reset demo data asks for confirmation, then restores the fictional learners and clears changes', () => {
    render(<Shell path="/coach/learner/DL-03" />)
    act(() => app.overrideNextLesson('DL-03', 'customer_credit', 'other'))
    act(() => app.setLang('te'))
    expect(id('coach-recommended').dataset.lesson).toBe('customer_credit')
    click(id('coach-reset'))
    expect(screen.getByRole('dialog')).toBeTruthy() // nothing deleted yet
    expect(app.progressOf('DL-03')!.recommendation.source).toBe('coach')
    click(id('coach-reset-yes'))
    expect(screen.getAllByTestId(/^roster-DL-\d+$/)).toHaveLength(6)
    expect(app.progressOf('DL-03')!.recommendation.source).toBe('rules')
    expect(app.learnerId).toBe('DL-01')
    expect(app.lang).toBe('en')
  })
})

describe('simplified learner flow (2026-11-01): Today = NOW + NEXT, My learning = every topic once', () => {
  it('a new learner: NOW = today’s lesson, NEXT = a short practice; one footer action', () => {
    render(<Shell path="/home" />)
    expect(id('home-now').dataset.kind).toBe('lesson')
    expect(id('home-today').dataset.module).toBe('m1')
    expect(id('home-next').dataset.kind).toBe('practice')
    expect(screen.getAllByTestId('primary')).toHaveLength(1)
    expect(id('home-done').dataset.done).toBe('0')
  })

  it('My learning lists the five topics once, in MVP order, each with one status', () => {
    render(<Shell path="/journey" />)
    const rows = screen.getAllByTestId(/^prog-m\d$/)
    expect(rows.map((r) => r.dataset.testid)).toEqual(['prog-m1', 'prog-m2', 'prog-m5', 'prog-m3', 'prog-m4'])
    expect(rows.map((r) => r.dataset.status)).toEqual(['now', 'coach', 'coach', 'later', 'later'])
    expect(id('journey-practice-review').dataset.enabled).toBe('false') // review only after the lesson
  })

  it('after the lesson: NOW = practice, NEXT = the next topic with the coach (Everyday costs)', () => {
    render(<Shell path="/coach" />)
    act(() => app.startSession('DL-04')) // coach hands the phone to the learner (new session)
    cleanup()
    render(<Shell path="/home" />)
    expect(app.completed).toContain('m1')
    expect(id('home-now').dataset.kind).toBe('practice')
    expect(id('home-next').dataset.kind).toBe('coach') // next topic has no in-app lesson yet: said honestly
    expect(id('home-with-coach')).toBeTruthy()
  })
})

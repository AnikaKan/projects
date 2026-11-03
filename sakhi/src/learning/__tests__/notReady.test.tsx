// @vitest-environment jsdom
// Modules 2–5 have no lesson content yet. A recommendation to them must lead to an honest, translated
// "not in the app yet — your coach will teach this" screen (readiness audit 2026-10-30), never a fake lesson
// or an English "Placeholder" message.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from '../../state/AppState'
import { LessonRoute } from '../ui/LessonExperience'
import { MemoryStore } from '../../assessment/storage'

function App({ path }: { path: string }) {
  return (
    <AppStateProvider store={new MemoryStore()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/lessons/:id" element={<LessonRoute />} />
        </Routes>
      </MemoryRouter>
    </AppStateProvider>
  )
}
beforeEach(() => localStorage.clear())
afterEach(cleanup)

describe('unwritten modules', () => {
  it.each(['m2', 'm3', 'm4', 'm5'])('%s shows the not-ready screen with a practice next step', (m) => {
    render(<App path={`/lessons/${m}`} />)
    const card = screen.getByTestId('module-not-ready')
    expect(card.dataset.module).toBe(m)
    expect(document.body.textContent).not.toMatch(/Placeholder/)
    expect(screen.getByTestId('not-ready-practice')).toBeTruthy()
    expect(screen.queryByTestId('lesson')).toBeNull()
  })
  it('module 1 is a real lesson', () => {
    render(<App path="/lessons/m1" />)
    expect(screen.getByTestId('lesson')).toBeTruthy()
  })
})

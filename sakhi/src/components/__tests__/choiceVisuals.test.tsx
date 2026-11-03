// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ChoiceCue } from '../choiceVisuals'

describe('choice cues', () => {
  it('uses neutral cues for yes / no, never correct/wrong marks', () => {
    for (const id of ['yes', 'no']) {
      const { container, unmount } = render(<ChoiceCue id={id} business="vegetable" />)
      expect(container.textContent).not.toMatch(/[✅❌✔✖]/u)
      unmount()
    }
    expect(render(<ChoiceCue id="yes" business="vegetable" />).container.textContent).toBe('👍')
    expect(render(<ChoiceCue id="no" business="vegetable" />).container.textContent).toBe('👎')
  })
})

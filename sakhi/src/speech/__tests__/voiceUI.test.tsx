// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppStateProvider, useApp } from '../../state/AppState'
import { SpeechProvider, StopSpeechOnNavigate } from '../SpeechContext'
import { VoiceAnswer } from '../../components/speech/VoiceAnswer'
import { SpeakControls } from '../../components/speech/SpeakControls'
import { LanguageScreen } from '../../screens/Onboarding'
import { LessonRoute } from '../../learning/ui/LessonExperience'
import { MemoryStore } from '../../assessment/storage'
import { flush, RecognitionHarness, SynthHarness, V } from './fakes'

let rec: RecognitionHarness
let synth: SynthHarness
let app: ReturnType<typeof useApp>
let lessonStore: MemoryStore

function Spy() {
  app = useApp()
  return null
}

const OPTIONS = [
  { id: 'left', label: '₹200', amount: 200 },
  { id: 'sales', label: '₹500', amount: 500 },
  { id: 'unsure', label: 'I’m not sure' },
]

function AnswerHarness() {
  const [picked, setPicked] = useState<string | null>(null)
  return (
    <div>
      <VoiceAnswer options={OPTIONS} onConfirm={setPicked} />
      <output data-testid="picked">{picked ?? ''}</output>
    </div>
  )
}

function Shell({ path, recognition = true, children }: { path: string; recognition?: boolean; children?: ReactNode }) {
  return (
    <AppStateProvider>
      <Spy />
      <SpeechProvider stt={recognition ? rec.service() : new RecognitionHarness().service({ webkitSpeechRecognition: undefined })} tts={synth.service()}>
        <MemoryRouter initialEntries={[path]}>
          <StopSpeechOnNavigate />
          <Routes>
            <Route path="/onboarding/language" element={<LanguageScreen />} />
            <Route path="/answer" element={<AnswerHarness />} />
            <Route path="/lessons/:id" element={<LessonRoute store={lessonStore} />} />
            <Route
              path="/read"
              element={
                <div>
                  <SpeakControls text="Your profit is ₹200." />
                  <Link to="/elsewhere">away</Link>
                </div>
              }
            />
            <Route path="/elsewhere" element={<div>ELSEWHERE</div>} />
          </Routes>
          {children}
        </MemoryRouter>
      </SpeechProvider>
    </AppStateProvider>
  )
}

const setLang = (l: 'en' | 'hi' | 'te') => act(() => app.setLang(l))
const click = async (testid: string) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testid))
    await flush()
  })
}

beforeEach(() => {
  localStorage.clear()
  rec = new RecognitionHarness()
  synth = new SynthHarness([V.enIN, V.hiIN, V.teIN])
  lessonStore = new MemoryStore()
})
afterEach(cleanup)

describe('language selection', () => {
  it('shows English, हिन्दी, తెలుగు; selection persists across sessions', async () => {
    const first = render(<Shell path="/onboarding/language" />)
    const main = within(screen.getByRole('main'))
    for (const name of ['English', 'हिन्दी', 'తెలుగు']) expect(main.getByText(name)).toBeTruthy()
    fireEvent.click(main.getByText('తెలుగు'))
    expect(app.lang).toBe('te')
    expect(document.documentElement.lang).toBe('te-IN')
    first.unmount()
    render(<Shell path="/onboarding/language" />) // new session, same device
    expect(app.lang).toBe('te')
    expect(screen.getByText('మీ భాషను ఎంచుకోండి')).toBeTruthy()
  })

  it('বাংলা, অসমীয়া, தமிழ் are listed as "coming soon" previews and never change the app language', async () => {
    render(<Shell path="/onboarding/language" />)
    const before = app.lang
    for (const code of ['bn', 'as', 'ta']) {
      fireEvent.click(screen.getByTestId(`lang-preview-${code}`))
      const sheet = screen.getByTestId('preview-lang')
      expect(sheet.dataset.lang).toBe(code)
      expect(sheet.textContent).toContain('Coming soon')
      fireEvent.click(screen.getByTestId('preview-back'))
      expect(app.lang).toBe(before)
      expect(screen.queryByTestId('preview-lang')).toBeNull()
    }
  })

  it('each greeting is spoken with that language’s own voice', async () => {
    render(<Shell path="/onboarding/language" />)
    await act(flush)
    await click('greet-hi')
    expect(synth.spoken.at(-1)).toMatchObject({ text: 'स्वागत है', lang: 'hi-IN' })
    expect(synth.spoken.at(-1)!.voice!.lang).toBe('hi-IN')
  })

  it('a language without an installed voice is marked unavailable, not read in English', async () => {
    synth = new SynthHarness([V.enIN, V.hiIN]) // no Telugu voice
    render(<Shell path="/onboarding/language" />)
    await act(flush)
    const te = screen.getByTestId('greet-te')
    expect(te.dataset.availability).toBe('no-voice')
    expect((te as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(te)
    expect(synth.spoken).toEqual([])
  })
})

describe('speech-to-text answers', () => {
  it('microphone starts only after the button press', async () => {
    render(<Shell path="/answer" />)
    await act(flush)
    expect(rec.started).toEqual([])
    await click('stt-mic')
    expect(rec.started).toHaveLength(1)
  })

  it('permission granted: shows the words, the matching answer, and confirming selects it', async () => {
    rec.script = { kind: 'result', transcript: 'two hundred rupees', interim: 'two' }
    render(<Shell path="/answer" />)
    await click('stt-mic')
    expect((screen.getByTestId('stt-transcript') as HTMLInputElement).value).toBe('two hundred rupees')
    expect(screen.getByTestId('stt-match').dataset.option).toBe('left')
    expect(screen.getByTestId('picked').textContent).toBe('') // not submitted until confirmed
    await click('stt-confirm')
    expect(screen.getByTestId('picked').textContent).toBe('left')
  })

  it('permission denied: explains and keeps tap answers; no retry loop', async () => {
    rec.script = { kind: 'error', error: 'not-allowed' }
    render(<Shell path="/answer" />)
    await click('stt-mic')
    const fb = screen.getByTestId('stt-fallback')
    expect(fb.dataset.reason).toBe('permission-denied')
    expect(fb.textContent).toContain('microphone is blocked')
    expect(screen.queryByTestId('stt-mic')).toBeNull()
  })

  it('unsupported browser: tap fallback shown, no microphone button', async () => {
    render(<Shell path="/answer" recognition={false} />)
    expect(screen.getByTestId('stt-fallback').dataset.reason).toBe('unsupported')
    expect(screen.queryByTestId('stt-mic')).toBeNull()
  })

  it('Telugu recognition unavailable: says so in Telugu, never switches to English', async () => {
    rec.script = { kind: 'rejectLangs', langs: ['te-IN'], then: { kind: 'result', transcript: 'two hundred' } }
    render(<Shell path="/answer" />)
    setLang('te')
    await click('stt-mic')
    expect(screen.getByTestId('stt-fallback').textContent).toContain('తెలుగులో')
    expect(rec.started.map((s) => s.lang)).toEqual(['te-IN'])
  })

  it('silence: friendly message and the microphone stays available to try again', async () => {
    rec.script = { kind: 'error', error: 'no-speech' }
    render(<Shell path="/answer" />)
    await click('stt-mic')
    expect(screen.getByTestId('stt-error').textContent).toContain('didn’t hear anything')
    expect(screen.getByTestId('stt-mic')).toBeTruthy()
  })

  it('unintelligible input: no match, confirm disabled; manual correction fixes it', async () => {
    rec.script = { kind: 'result', transcript: 'umm the thing' }
    render(<Shell path="/answer" />)
    await click('stt-mic')
    expect(screen.getByTestId('stt-nomatch')).toBeTruthy()
    expect((screen.getByTestId('stt-confirm') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('stt-transcript'), { target: { value: 'five hundred' } })
    expect(screen.getByTestId('stt-match').dataset.option).toBe('sales')
    await click('stt-confirm')
    expect(screen.getByTestId('picked').textContent).toBe('sales')
  })

  it('retry listens again', async () => {
    rec.script = { kind: 'result', transcript: 'umm' }
    render(<Shell path="/answer" />)
    await click('stt-mic')
    rec.script = { kind: 'result', transcript: 'दो सौ' }
    await click('stt-retry')
    expect(rec.started).toHaveLength(2)
    expect(screen.getByTestId('stt-match').dataset.option).toBe('left')
  })

  it('Hindi and Telugu amounts are recognised and matched', async () => {
    render(<Shell path="/answer" />)
    setLang('hi')
    rec.script = { kind: 'result', transcript: 'पाँच सौ रुपये' }
    await click('stt-mic')
    expect(rec.started.at(-1)!.lang).toBe('hi-IN')
    expect(screen.getByTestId('stt-match').dataset.option).toBe('sales')
    setLang('te')
    rec.script = { kind: 'result', transcript: 'రెండు వందలు' }
    await click('stt-mic')
    expect(rec.started.at(-1)!.lang).toBe('te-IN')
    expect(screen.getByTestId('stt-match').dataset.option).toBe('left')
  })
})

describe('text-to-speech controls', () => {
  it('replay, pause, resume, stop and slow playback', async () => {
    synth.hold = true
    render(<Shell path="/read" />)
    await act(flush)
    await click('tts-play')
    expect(synth.spoken[0]).toMatchObject({ text: 'Your profit is 200 rupees.', lang: 'en-IN' })
    expect(screen.getByTestId('tts-controls').dataset.state).toBe('speaking')
    await click('tts-pause')
    expect(screen.getByTestId('tts-controls').dataset.state).toBe('paused')
    await click('tts-resume')
    await click('tts-stop')
    expect(screen.getByTestId('tts-controls').dataset.state).toBe('idle')
    await click('tts-slow')
    await click('tts-play') // now labelled Replay
    expect(synth.spoken.at(-1)!.rate).toBeLessThan(synth.spoken[0].rate)
  })

  it('no voice for the language: clear fallback, nothing spoken', async () => {
    synth = new SynthHarness([V.enIN])
    render(<Shell path="/read" />)
    setLang('hi')
    await act(flush)
    expect(screen.getByTestId('tts-fallback').textContent).toContain('हिन्दी आवाज़ नहीं है')
    expect(synth.spoken).toEqual([])
  })

  it('navigating away cancels audio and listening', async () => {
    synth.hold = true
    render(<Shell path="/read" />)
    await act(flush)
    await click('tts-play')
    const before = synth.cancels
    await act(async () => {
      fireEvent.click(screen.getByText('away'))
      await flush()
    })
    expect(screen.getByText('ELSEWHERE')).toBeTruthy()
    expect(synth.cancels).toBeGreaterThan(before)
  })
})

describe('in a lesson', () => {
  it('a spoken Telugu amount answers the lesson question; scoring is unchanged', async () => {
    render(<Shell path="/lessons/m1" />)
    setLang('te')
    await act(flush)
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getAllByTestId('primary')[0]))
    expect(screen.getByTestId('lesson').dataset.step).toBe('response')
    rec.script = { kind: 'result', transcript: 'రెండు వందలు' }
    await click('stt-mic')
    await click('stt-confirm')
    await act(async () => fireEvent.click(screen.getAllByTestId('primary')[0])) // Check answer
    expect(screen.getByTestId('feedback').dataset.tone).toBe('positive')
  })

  it('switching language mid-lesson stops speech, keeps progress, and listens in the new language', async () => {
    synth.hold = true
    render(<Shell path="/lessons/m1" />)
    await act(flush)
    for (let i = 0; i < 3; i++) await act(async () => fireEvent.click(screen.getAllByTestId('primary')[0]))
    await click('tts-play')
    expect(synth.spoken.at(-1)!.lang).toBe('en-IN')
    const cancels = synth.cancels
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Language' })))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByText('हिन्दी'))
      await flush()
    })
    expect(synth.cancels).toBeGreaterThan(cancels)
    expect(screen.getByTestId('lesson').dataset.step).toBe('response')
    rec.script = { kind: 'result', transcript: 'दो सौ' }
    await click('stt-mic')
    expect(rec.started.at(-1)!.lang).toBe('hi-IN')
    expect(screen.getByTestId('stt-match').dataset.option).toBe('left')
  })
})

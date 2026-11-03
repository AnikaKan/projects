import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ExternalLink, Eye, PenLine, RotateCcw, WifiOff } from 'lucide-react'
import { AppRoutes } from '../AppRoutes'
import { useApp } from '../state/AppState'
import { LANGS } from '../i18n/strings'

interface Frame {
  no: string
  name: string
  path: string
  purpose: string
  primary: string
  voice: string
  wide?: boolean
}

const FRAMES: Frame[] = [
  { no: '1', name: 'Language selection', path: '/onboarding/language', purpose: 'Pick a language by its native name; hear each greeting.', primary: 'Continue', voice: 'Play button per language · tap card' },
  { no: '2', name: 'Business selection', path: '/onboarding/business', purpose: 'Personalise every scenario to her stall.', primary: 'Continue', voice: 'Narrated prompt · tap picture card' },
  { no: '3a', name: 'Diagnostic — intro', path: '/assessment', purpose: '“Let’s see where to start”, framed as a starting point, not a test.', primary: 'Start', voice: 'Narration' },
  { no: '3b', name: 'Diagnostic — question', path: '/assessment?demo=question', purpose: 'One question at a time, customised to her business; tap or voice; “Not sure” is respected.', primary: 'Confirm answer', voice: 'Mic → deterministic resolver → confirm · tap' },
  { no: '3c', name: 'Diagnostic — recommendation', path: '/assessment/result?demo=1', purpose: 'Recommended lesson from the deterministic engine; concept levels without mastery claims.', primary: 'Start this lesson', voice: 'Reason narrated' },
  { no: '4', name: 'Personalised home', path: '/home', purpose: 'Today’s lesson for her business, challenge check-in, journey.', primary: 'Start today’s lesson', voice: '“Today’s plan” audio' },
  { no: '5a', name: 'Lesson — starting point', path: '/lessons/m1', purpose: 'State 1: names the assessment misconception kindly (₹500 sales ≠ ₹500 profit).', primary: 'Continue', voice: 'Repeat' },
  { no: '5b', name: 'Lesson — business example', path: '/lessons/m1?demo=example', purpose: 'States 2–3: ₹500 − ₹300 = ₹200 with amount bars; other costs reduce final profit.', primary: 'Continue', voice: 'Repeat · Explain another way' },
  { no: '6a', name: 'Corrective feedback', path: '/lessons/m1?demo=corrective', purpose: 'States 4–5: learner chose ₹500 → encouraging correction, Try again or Explain another way.', primary: 'Try again', voice: 'Repeat · Explain another way' },
  { no: '6b', name: 'Second scenario', path: '/lessons/m1?demo=practice', purpose: 'State 6: new day with spoilage + auto fare; deterministic answer key.', primary: 'Check answer', voice: 'Repeat' },
  { no: '7', name: 'Weekly challenge → completion', path: '/lessons/m1?demo=challenge', purpose: 'States 8–9: practical activity at the stall, then a clear completion state.', primary: 'I’ll do this', voice: 'Repeat' },
  { no: '8', name: 'My learning (Lessons + Practice + Progress merged)', path: '/journey', purpose: 'Every topic once, in MVP order: status (✅ ▶ 👩‍🏫 🔒), level (🌱🌿🌳), practise / review, weekly tasks.', primary: 'Topic card', voice: '“Hear how I am doing”' },
  { no: '9a', name: 'Coach View — roster', path: '/coach', purpose: 'Learners sorted by visit due; flags; search & filter.', primary: 'Open learner', voice: 'Text-first (coach-facing)' },
  { no: '9b', name: 'Coach View — learner', path: '/coach/learner/DL-03', purpose: 'Profile, assessment, lessons, misconceptions, challenges, recommended lesson (review / change with reason).', primary: 'Start session', voice: 'Lesson replay in learner’s language' },
  { no: '10', name: 'Challenge check-in', path: '/checkin', purpose: 'Next session: did you try it? difficulties, supportive follow-up.', primary: 'Yes / Partly / Not yet', voice: 'Narrated activity and choices' },
  { no: '+', name: 'Today', path: '/home', purpose: 'NOW (one action) · NEXT · this week’s task · done so far.', primary: 'Start / continue / practise', voice: '“Today’s plan”' },
  { no: '+', name: 'Practice question', path: '/practice/m1', purpose: 'Question and every choice read aloud with the choice highlighted; tap or speak.', primary: 'Check answer', voice: 'Auto-read + per-choice 🔊' },
]

export function Gallery() {
  const app = useApp()
  const [mode, setMode] = useState<'visual' | 'wire'>('visual')
  const [demo, setDemo] = useState<'new' | 'after'>(app.completed.length ? 'after' : 'new')
  const wire = mode === 'wire'

  // Frames show fictional demo learners: DL-01 is new; DL-03 has finished lesson 1 and has an activity to check in on.
  const seed = (d: 'new' | 'after') => {
    setDemo(d)
    app.resetDemo()
    if (d === 'after') app.startSession('DL-03')
  }

  return (
    <div className="min-h-[100dvh] bg-[#2A2522] text-white">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 border-b border-white/10 bg-[#2A2522]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
          <div className="mr-auto">
            <h1 className="text-lg font-bold">Sakhi — Clickable wireframes</h1>
            <p className="text-xs text-white/60">Every frame is live and clickable. All content is fictional. Hindi/Telugu copy is draft.</p>
          </div>
          <Seg
            label="Language"
            value={app.lang}
            onChange={(v) => {
              app.setLang(v as typeof app.lang)
              app.setCoachLang(v as typeof app.lang)
            }}
            options={LANGS.map((l) => ({ value: l.code, label: l.native }))}
          />
          <Seg
            label="Mode"
            value={mode}
            onChange={(v) => setMode(v as 'visual' | 'wire')}
            options={[
              { value: 'visual', label: 'Visual', icon: <Eye size={14} /> },
              { value: 'wire', label: 'Wireframe', icon: <PenLine size={14} /> },
            ]}
          />
          <Seg
            label="Demo state"
            value={demo}
            onChange={(v) => seed(v as 'new' | 'after')}
            options={[
              { value: 'new', label: 'New learner' },
              { value: 'after', label: 'After lesson 1' },
            ]}
          />
          <button
            onClick={() => app.setOffline(!app.offline)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${app.offline ? 'bg-marigold text-ink' : 'bg-white/10'}`}
          >
            <WifiOff size={14} aria-hidden /> Offline {app.offline ? 'on' : 'off'}
          </button>
          <button onClick={() => seed(demo)} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold">
            <RotateCcw size={14} aria-hidden /> Reset frames
          </button>
          {!import.meta.env.VITE_GALLERY_ONLY && <a href="#/" className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white px-3 text-sm font-semibold text-ink">
            <ExternalLink size={14} aria-hidden /> Open live app
          </a>}
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-[repeat(auto-fill,minmax(min(100%,375px),1fr))] gap-x-8 gap-y-10 px-4 py-8 justify-items-center">
        {FRAMES.map((f) => (
          <FrameCard key={f.no + f.name + mode + demo} f={f} wire={wire} />
        ))}
      </main>
    </div>
  )
}

function FrameCard({ f, wire }: { f: Frame; wire: boolean }) {
  return (
    <figure className="w-full max-w-[375px]">
      <figcaption className="mb-2 flex items-baseline gap-2">
        <span className="rounded bg-marigold px-1.5 text-xs font-bold text-ink">{f.no}</span>
        <span className="text-sm font-semibold">{f.name}</span>
        <code className="ml-auto truncate text-[11px] text-white/50">#{f.path}</code>
      </figcaption>
      <div
        className={`relative h-[760px] w-full overflow-hidden rounded-[28px] border-[6px] border-black bg-paper shadow-2xl ${wire ? 'wire' : ''}`}
      >
        <MemoryRouter initialEntries={[f.path]}>
          <AppRoutes />
        </MemoryRouter>
      </div>
      {wire && (
        <dl className="mt-3 space-y-1 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/80 ring-1 ring-white/10">
          <div>
            <dt className="inline font-semibold text-white">Purpose: </dt>
            <dd className="inline">{f.purpose}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-white">Primary action: </dt>
            <dd className="inline">{f.primary}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-white">Voice / tap: </dt>
            <dd className="inline">{f.voice}</dd>
          </div>
        </dl>
      )}
    </figure>
  )
}

function Seg({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string; icon?: ReactNode }[]
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-1" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex min-h-[32px] items-center gap-1 rounded-full px-3 text-sm font-semibold leading-normal ${value === o.value ? 'bg-white text-ink' : 'text-white/80'}`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

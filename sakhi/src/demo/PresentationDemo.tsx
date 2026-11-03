// 40-second presentation demo at #/demo: Language → Voice check → Recommendation → Coach View.
// Isolated: its own in-memory app state (a separate AppStateProvider with a MemoryStore), so it never reads or
// writes the real learner records. Speech uses the app's real services (browser speech engines).
// The presenter controls every transition; nothing advances on its own.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { AppStateProvider, moduleOfLesson, useApp } from '../state/AppState'
import { MemoryStore } from '../assessment/storage'
import { at as aText } from '../assessment/i18n'
import { LANGS, translate, type StringKey } from '../i18n/strings'
import { PREVIEW_LANGS } from '../i18n/previewLanguages'
import { AnswerChoices } from '../components/AnswerChoices'
import { VoiceAnswer } from '../components/speech/VoiceAnswer'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import { LESSONS } from '../learning/storage'
import { explain } from '../coaching/explain'
import {
  DEMO_LEARNER,
  DEMO_QUESTION,
  DEMO_STORAGE_KEY,
  INITIAL_DEMO,
  RESULT_TEXT,
  coachGuidance,
  demoChoices,
  loadDemo,
  outcomeKind,
  scoreDemo,
  type DemoLang,
  type DemoStage,
  type DemoState,
} from './demoModel'

const STAGES: { id: DemoStage; label: string; icon: string }[] = [
  { id: 'language', label: 'Language', icon: '🌐' },
  { id: 'question', label: 'Voice check', icon: '🎤' },
  { id: 'result', label: 'Recommendation', icon: '💡' },
  { id: 'coach', label: 'Coach View', icon: '👩‍🏫' },
]
const session = () => (typeof sessionStorage === 'undefined' ? undefined : sessionStorage)
const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)

export function PresentationDemo() {
  // A private store per page load: the demo's learner data never reaches the real repository.
  const [store] = useState(() => new MemoryStore())
  return (
    <AppStateProvider store={store}>
      <DemoInner />
    </AppStateProvider>
  )
}

function DemoInner() {
  const app = useApp()
  const [s, setS] = useState<DemoState>(() => loadDemo(session()))
  useEffect(() => {
    try {
      session()?.setItem(DEMO_STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* private mode: the demo still works in memory */
    }
  }, [s])
  useEffect(() => {
    if (app.lang !== s.lang) app.setLang(s.lang)
  }, [s.lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const outcome = useMemo(() => (s.answer ? scoreDemo(s.answer) : null), [s.answer])
  const go = (stage: DemoStage) => setS((x) => ({ ...x, stage }))
  const reset = () => {
    try {
      session()?.removeItem(DEMO_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setS(INITIAL_DEMO)
  }
  const enabled = (st: DemoStage) => st === 'language' || st === 'question' || (!!outcome && s.submitted)

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#F3E6D6] text-ink" data-testid="demo" data-stage={s.stage}>
      <header className="flex flex-wrap items-center gap-3 bg-brand px-4 py-2.5 text-white">
        <div className="mr-auto flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-xl font-bold text-brand" aria-hidden>
            ₹
          </span>
          <div>
            <div className="text-lg font-bold leading-tight">Sakhi</div>
            <div className="text-xs font-semibold text-white/85">Presentation demo · fictional learner · abbreviated 1-question check</div>
          </div>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Demo stages">
          {STAGES.map((st, i) => (
            <button
              key={st.id}
              data-testid={`demo-stage-${st.id}`}
              aria-current={s.stage === st.id ? 'step' : undefined}
              disabled={!enabled(st.id)}
              onClick={() => go(st.id)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-bold disabled:opacity-40 ${s.stage === st.id ? 'bg-white text-brand' : 'bg-white/15 text-white'}`}
            >
              <span aria-hidden>{st.icon}</span> {i + 1}. {st.label}
            </button>
          ))}
        </nav>
        <button data-testid="demo-reset" onClick={reset} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm font-bold ring-2 ring-white/70 hover:bg-white/10">
          <RotateCcw size={16} aria-hidden /> Reset demo
        </button>
      </header>

      <main className="flex flex-1 items-start justify-center gap-8 p-4 md:p-6">
        {s.stage === 'coach' && outcome ? (
          <CoachStage outcome={outcome} onBack={() => go('result')} />
        ) : (
          <>
          <Caption stage={s.stage} />
          <Phone>
            {s.stage === 'language' && (
              <LanguageStage
                onPick={(lang) => {
                  app.setLang(lang)
                  setS((x) => ({ ...x, lang, stage: 'question', answer: x.lang === lang ? x.answer : null, submitted: x.lang === lang ? x.submitted : false }))
                }}
              />
            )}
            {s.stage === 'question' && (
              <QuestionStage
                lang={s.lang}
                answer={s.answer}
                onAnswer={(a) => setS((x) => ({ ...x, answer: { ...a, lang: x.lang, at: new Date().toISOString() }, submitted: false }))}
                onSubmit={() => setS((x) => ({ ...x, submitted: true, stage: 'result' }))}
              />
            )}
            {s.stage === 'result' && outcome && <ResultStage lang={s.lang} outcome={outcome} onCoach={() => go('coach')} />}
          </Phone>
          </>
        )}
      </main>
    </div>
  )
}

const CAPTION: Record<DemoStage, [string, string]> = {
  language: ['Her language, first', 'Six Indian languages planned. English, Hindi and Telugu work today.'],
  question: ['A quick voice check', 'She listens, then answers by speaking or tapping. No reading needed.'],
  result: ['Personalised, not generic', 'Her own answer decides what she learns next.'],
  coach: ['Guidance for the coordinator', 'Why this lesson, what she struggled with, what to reinforce.'],
}

function Caption({ stage }: { stage: DemoStage }) {
  const [title, body] = CAPTION[stage]
  return (
    <aside className="hidden max-w-[300px] self-center xl:block" data-testid="demo-caption">
      <div className="text-sm font-bold uppercase tracking-wider text-brand">Step {STAGES.findIndex((x) => x.id === stage) + 1} of 4</div>
      <h2 className="mt-1 text-3xl font-bold leading-tight">{title}</h2>
      <p className="mt-2 text-lg leading-relaxed text-muted">{body}</p>
    </aside>
  )
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[400px] overflow-hidden rounded-[2.2rem] bg-paper shadow-2xl ring-8 ring-[#2A1A12]" data-testid="demo-phone">
      <div className="flex h-[min(780px,calc(100dvh-110px))] flex-col overflow-y-auto">{children}</div>
    </div>
  )
}

function LearnerChip() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line" data-testid="demo-learner">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-3xl" aria-hidden>
        🥬
      </span>
      <div className="leading-tight">
        <div className="text-lg font-bold">Saraswathi</div>
        <div className="text-sm text-muted">Vegetable stall · Level: not yet determined</div>
      </div>
    </div>
  )
}

function LanguageStage({ onPick }: { onPick: (l: DemoLang) => void }) {
  const [soon, setSoon] = useState<string | null>(null)
  return (
    <div className="flex flex-1 flex-col gap-4 p-5" data-testid="demo-language">
      <LearnerChip />
      <h1 className="text-center text-2xl font-bold leading-snug">
        <span aria-hidden>🌐 </span>Choose your language
        <span className="mt-1 block text-lg font-semibold text-muted">भाषा चुनें · భాష ఎంచుకోండి</span>
      </h1>
      <div className="grid grid-cols-2 gap-3">
        {LANGS.map((l) => (
          <button
            key={l.code}
            lang={l.bcp47}
            data-testid={`demo-lang-${l.code}`}
            onClick={() => onPick(l.code as DemoLang)}
            className="flex min-h-[96px] flex-col items-center justify-center rounded-2xl bg-white px-2 ring-2 ring-brand/30 active:bg-brand-soft"
          >
            <span className="text-2xl font-bold">{l.native}</span>
            <span className="text-sm text-muted">{translate('en', `lang.name.${l.code}` as StringKey)}</span>
          </button>
        ))}
        {PREVIEW_LANGS.map((l) => (
          <button
            key={l.code}
            lang={l.bcp47}
            data-testid={`demo-lang-${l.code}`}
            data-preview="true"
            onClick={() => setSoon(l.native)}
            className="flex min-h-[96px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-marigold bg-marigold-soft/60 px-2"
          >
            <span className="text-2xl font-bold">{l.native}</span>
            <span className="text-sm font-bold text-[#7A4A0E]">{l.englishName} · Coming soon</span>
          </button>
        ))}
      </div>
      {soon && (
        <p className="rounded-xl bg-white p-3 text-center text-base ring-1 ring-line" role="status" data-testid="demo-soon">
          {soon}: coming soon. Today: English, हिन्दी, తెలుగు.
        </p>
      )}
    </div>
  )
}

function QuestionStage({
  lang,
  answer,
  onAnswer,
  onSubmit,
}: {
  lang: DemoLang
  answer: DemoState['answer']
  onAnswer: (a: { optionId: string; source: 'voice' | 'tap'; transcript?: string }) => void
  onSubmit: () => void
}) {
  const q = DEMO_QUESTION[lang]
  const choices = demoChoices(lang)
  const picked = answer && answer.lang === lang ? answer : null
  const label = choices.find((c) => c.id === picked?.optionId)?.label
  return (
    <div className="flex flex-1 flex-col" data-testid="demo-question">
      <div className="flex-1 p-5">
        <span className="inline-block rounded-full bg-marigold-soft px-3 py-1 text-sm font-bold text-[#7A4A0E]" data-testid="demo-abbreviated">
          Demo check · 1 question
        </span>
        <div className="mt-2 flex items-center justify-center gap-3" aria-hidden>
          <span className="text-5xl">🥬</span>
          <span className="text-5xl">🧺</span>
          <span className="rounded-2xl bg-leaf-soft px-3 py-1.5 text-2xl font-bold text-leaf ring-2 ring-leaf/40">💵 ₹500</span>
        </div>
        <p className="mt-3 text-xl font-bold leading-snug" lang={lang} data-testid="demo-stem">
          {q}
        </p>
        <AnswerChoices
          question={q}
          choices={choices}
          readKey={`demo-${lang}`}
          selectedId={picked?.optionId ?? null}
          onSelect={(optionId) => onAnswer({ optionId, source: 'tap' })}
          voice={<VoiceAnswer options={choices} questionText={q} onConfirm={(optionId, transcript) => onAnswer({ optionId, source: 'voice', transcript })} />}
        />
        {picked && (
          <p className="mt-3 rounded-xl bg-white p-3 text-base ring-1 ring-line" data-testid="demo-answer-source" data-source={picked.source}>
            {picked.source === 'voice' ? (
              <>
                🎤 <strong>Heard:</strong> “{picked.transcript}” → <strong>{label}</strong>
              </>
            ) : (
              <>
                👆 <strong>Tapped:</strong> {label}
              </>
            )}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 bg-paper p-4">
        <button
          data-testid="demo-submit"
          disabled={!picked}
          onClick={onSubmit}
          className="min-h-[60px] w-full rounded-full bg-brand px-5 text-xl font-bold text-white disabled:bg-disabled disabled:text-disabled-ink"
        >
          {aText(lang, 'a.confirm')}
        </button>
      </div>
    </div>
  )
}

function ResultStage({ lang, outcome, onCoach }: { lang: DemoLang; outcome: ReturnType<typeof scoreDemo>; onCoach: () => void }) {
  const T = RESULT_TEXT[lang]
  const kind = outcomeKind(outcome)
  const rec = outcome.result.recommendation
  const m = moduleOfLesson(rec.lessonId)
  const { sales, cost, left } = outcome.amounts
  const tile = (emoji: string, amount: number, text: string, cls: string, testid: string) => (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ring-2 ${cls}`} data-testid={testid}>
      <span className="text-3xl" aria-hidden>
        {emoji}
      </span>
      <span className="text-2xl font-bold tabular-nums">{inr(amount)}</span>
      <span className="text-sm font-semibold leading-snug">{text}</span>
    </div>
  )
  return (
    <div className="flex flex-1 flex-col" data-testid="demo-result" data-lesson={rec.lessonId} data-kind={kind} lang={lang}>
      <div className="flex-1 space-y-3 p-5">
        <h2 className="text-2xl font-bold">💡 {T.title}</h2>
        <div className="rounded-2xl bg-brand-soft p-4 ring-1 ring-brand/30">
          <div className="text-sm font-bold uppercase tracking-wide text-brand">{T.lesson}</div>
          <div className="mt-1 flex items-center gap-2 text-2xl font-bold" data-testid="demo-rec-lesson">
            <span aria-hidden>{MODULE_EMOJI[m]}</span>
            {translate(lang, `${m}.title` as StringKey)}
          </div>
          {!LESSONS[rec.lessonId] && <p className="text-sm font-semibold text-[#7A4A0E]">👩‍🏫 {T.withCoach}</p>}
          <div className="mt-2 text-sm font-bold uppercase tracking-wide text-brand">{T.level}</div>
          <div className="text-lg font-bold" data-testid="demo-rec-level" data-level={outcome.level ?? 'none'}>
            {outcome.level ? `🌱 ${T.foundational}` : `⚪ ${T.undetermined}`}
          </div>
          <div className="mt-2 text-sm font-bold uppercase tracking-wide text-brand">{T.reason}</div>
          <p className="text-base leading-relaxed" data-testid="demo-rec-reason">
            {T[`reason.${kind}`]}
          </p>
        </div>
        <div className="space-y-2" data-testid="demo-picture">
          {tile('🧺', sales, T.sales, 'bg-white ring-line', 'demo-tile-sales')}
          {tile('📦', cost, T.cost, 'bg-white ring-line', 'demo-tile-cost')}
          {tile('💰', left, T.left, 'bg-leaf-soft ring-leaf/40', 'demo-tile-left')}
          <p className="text-sm text-muted">{T.leftNote}</p>
        </div>
        <p className="text-xs font-semibold text-muted">{T.abbreviated}</p>
      </div>
      <div className="sticky bottom-0 bg-paper p-4">
        <button data-testid="demo-to-coach" onClick={onCoach} className="min-h-[60px] w-full rounded-full bg-brand px-5 text-xl font-bold text-white">
          👩‍🏫 {T.coach}
        </button>
      </div>
    </div>
  )
}

function CoachStage({ outcome, onBack }: { outcome: ReturnType<typeof scoreDemo>; onBack: () => void }) {
  const g = coachGuidance(outcome)
  const c = outcome.coaching
  const m = moduleOfLesson(c.recommendedLessonId)
  const opt = demoChoices('en').find((o) => o.id === outcome.answer.optionId)!
  const shownOpt = demoChoices(outcome.answer.lang).find((o) => o.id === outcome.answer.optionId)!
  const x = explain(c, { lang: 'en', name: 'Saraswathi', business: DEMO_LEARNER.business })
  const kind = outcomeKind(outcome)
  const card = (n: number, icon: string, title: string, body: ReactNode, testid: string, cls = 'bg-white') => (
    <section className={`rounded-2xl p-5 ring-1 ring-line ${cls}`} data-testid={testid}>
      <h3 className="mb-2 flex items-center gap-2 text-xl font-bold">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-base text-white">{n}</span>
        <span aria-hidden>{icon}</span> {title}
      </h3>
      {body}
    </section>
  )
  return (
    <div className="w-full max-w-[1040px] overflow-hidden rounded-3xl bg-paper shadow-2xl ring-1 ring-line" data-testid="demo-coach" data-lesson={c.recommendedLessonId} data-rule={c.recommendationRuleId}>
      <div className="flex flex-wrap items-center gap-3 bg-[#8C3511] px-5 py-3 text-white">
        <span className="text-3xl" aria-hidden>
          👩‍🏫
        </span>
        <div className="mr-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/80">Coach View · field coordinator</div>
          <div className="text-xl font-bold">Saraswathi · 🥬 Vegetable stall · {LANGS.find((l) => l.code === outcome.answer.lang)!.native}</div>
        </div>
        <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">Fictional demo learner</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-brand-soft px-5 py-3">
        <span className="text-sm font-bold uppercase tracking-wide text-brand">Recommended</span>
        <span className="text-xl font-bold" data-testid="demo-coach-lesson">
          {MODULE_EMOJI[m]} {translate('en', `${m}.title` as StringKey)} — {outcome.level ? 'Foundational' : 'Level not yet determined'}
        </span>
      </div>
      <div className="grid gap-4 p-5 lg:grid-cols-3">
        {card(
          1,
          '❔',
          'Why this lesson?',
          <>
            <p className="text-base leading-relaxed" data-testid="demo-why">
              {g.why}
            </p>
            <div className="mt-3 rounded-xl bg-paper p-3 ring-1 ring-line" data-testid="demo-evidence" data-option={opt.id} data-source={outcome.answer.source}>
              <div className="text-xs font-bold uppercase tracking-wide text-muted">📋 Her diagnostic answer</div>
              <p className="mt-1 text-sm italic">“{DEMO_QUESTION.en}”</p>
              <p className="mt-1 text-base font-bold">
                → {opt.label}
                {outcome.answer.lang !== 'en' && <span className="font-semibold"> ({shownOpt.label})</span>}
              </p>
              <p className="mt-1 text-sm text-muted">{outcome.answer.source === 'voice' ? `🎤 Spoken: “${outcome.answer.transcript}”` : '👆 Tapped (no voice used)'}</p>
            </div>
            {x.insufficient && <p className="mt-2 text-sm text-muted">⚠️ {x.insufficient}</p>}
          </>,
          'demo-coach-why',
        )}
        {card(
          2,
          '🎯',
          'What she struggled with',
          <>
            <div className={`flex items-center justify-center gap-3 rounded-xl p-3 text-2xl font-bold ${kind === 'correct' ? 'bg-leaf-soft text-leaf' : 'bg-clay-soft text-clay'}`} aria-hidden>
              🧺 Sales ≠ 💰 Profit
            </div>
            <p className="mt-3 text-base leading-relaxed" data-testid="demo-gap">
              <strong>Learning gap:</strong> {g.gap}
            </p>
            {g.misconception && (
              <p className="mt-2 text-base leading-relaxed" data-testid="demo-misconception">
                <strong>Specific misconception:</strong> {g.misconception}
              </p>
            )}
            <span className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${kind === 'correct' ? 'bg-leaf-soft text-leaf' : 'bg-clay-soft text-clay'}`}>
              {kind === 'correct' ? '✅ No gap found on this question' : '🔁 Needs practice'}
            </span>
          </>,
          'demo-coach-gap',
        )}
        {card(
          3,
          '📍',
          'Next visit: what to reinforce',
          <>
            <p className="text-base font-semibold leading-relaxed" data-testid="demo-reinforce">
              {g.reinforce}
            </p>
            <p className="mt-3 rounded-xl bg-marigold-soft p-3 text-base" data-testid="demo-coach-question">
              <strong>❓ Ask:</strong> “{g.question}”
            </p>
            <p className="mt-3 text-base" data-testid="demo-goal">
              <strong>Goal:</strong> {g.goal}
            </p>
          </>,
          'demo-coach-reinforce',
          'bg-white ring-2 ring-brand/40',
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 text-sm text-muted">
        <button onClick={onBack} className="min-h-[44px] rounded-full px-4 font-bold text-brand ring-1 ring-brand/40">
          ← Recommendation
        </button>
        <span>Rule {c.recommendationRuleId} · deterministic, from the answer recorded in this demo</span>
      </div>
    </div>
  )
}

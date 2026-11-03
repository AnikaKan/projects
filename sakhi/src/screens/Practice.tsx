import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Keyboard, RotateCcw } from 'lucide-react'
import { ScreenShell } from '../components/ScreenShell'
import { AudioButton, Card, PrimaryButton } from '../components/ui'
import { VoiceAnswer } from '../components/speech/VoiceAnswer'
import { AnswerChoices } from '../components/AnswerChoices'
import { useApp } from '../state/AppState'
import { LESSON_SCENARIOS, PRACTICE_SCENARIOS, basicScenario, inr, practiceOptions, profit, scoreNumeric, type Misconception, type Scenario } from '../lib/calc'

const HINT: Record<Misconception, string> = { SALES_AS_PROFIT: 'pr.hintSales', IGNORES_WASTE: 'pr.hintWaste', ADDS_COSTS: 'pr.hintAdds' }
const hintKey = (m: Misconception | undefined, basic: boolean) => (!m ? 'pr.hintOther' : basic && m === 'SALES_AS_PROFIT' ? 'pr.hintSalesBasic' : HINT[m])
const MIS_CODE = { IGNORES_WASTE: 'misconception_ignores_hidden_costs', SALES_AS_PROFIT: 'misconception_revenue_vs_profit', ADDS_COSTS: 'misconception_profit_adds_costs' } as const

/** Picture strip of the sum: 🧺 sales − 📦 stock (− 🥀 spoiled) = 💰 ?  Numbers come from the calculation engine. */
function SumStrip({ s, answer }: { s: Scenario; answer?: number }) {
  const { t } = useApp()
  const parts = [
    { e: '🧺', k: 'pr.sales', v: s.sales, op: '' },
    { e: '📦', k: 'pr.stock', v: s.stock, op: '−' },
    ...(s.waste ? [{ e: '🥀', k: 'pr.waste', v: s.waste, op: '−' }] : []),
  ]
  return (
    <div className="mt-2 flex flex-wrap items-stretch gap-1.5" data-testid="sum-strip" aria-hidden>
      {parts.map((p) => (
        <div key={p.k} className="flex items-center gap-1.5">
          {p.op && <span className="text-xl font-bold text-muted">{p.op}</span>}
          <span className="flex flex-col items-center rounded-xl bg-white px-2.5 py-1 ring-1 ring-line">
            <span className="text-xl">{p.e}</span>
            <span className="text-lg font-bold tabular-nums">{inr(p.v)}</span>
            <span className="text-xs font-semibold text-muted">{t(p.k)}</span>
          </span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="text-xl font-bold text-muted">=</span>
        <span className={`flex flex-col items-center rounded-xl px-2.5 py-1 ring-2 ${answer !== undefined ? 'bg-leaf-soft ring-leaf' : 'bg-marigold-soft ring-marigold'}`}>
          <span className="text-xl">💰</span>
          <span className="text-lg font-bold tabular-nums">{answer !== undefined ? inr(answer) : '?'}</span>
          <span className="text-xs font-semibold text-muted">{t(s.waste ? 'pr.profit' : 'pr.left')}</span>
        </span>
      </div>
    </div>
  )
}

function Equation({ s }: { s: Scenario }) {
  const { t } = useApp()
  const rows = [
    { k: 'pr.sales', v: inr(s.sales), op: '' },
    { k: 'pr.stock', v: inr(s.stock), op: '−' },
    ...(s.waste ? [{ k: 'pr.waste', v: inr(s.waste), op: '−' }] : []),
  ]
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
      {rows.map((r) => (
        <div key={r.k} className="flex items-center justify-between py-1 text-lg">
          <span className="leading-snug">
            <span className="inline-block w-5 font-bold text-muted">{r.op}</span>
            {t(r.k)}
          </span>
          <span className="font-semibold tabular-nums">{r.v}</span>
        </div>
      ))}
      <div className="mt-1 flex items-center justify-between border-t-2 border-ink pt-2 text-xl font-bold">
        <span className="leading-snug">
          <span className="inline-block w-5">=</span>
          {t(s.waste ? 'pr.profit' : 'pr.left')}
        </span>
        <span className="tabular-nums text-leaf">{inr(profit(s))}</span>
      </div>
    </div>
  )
}

/**
 * Practice set for module 1, personalised by level (docs/DIAGNOSTIC_STRATEGY.md §6):
 *   foundational learner (or topic not yet practised) → 1. easy: two numbers  2. a little harder: + spoiled goods
 *   intermediate learner who has practised the topic   → the harder question only
 *   review (after the lesson)                           → the lesson's own numbers
 */
/** Start with the easy question unless she reached the intermediate tier AND has already practised the topic. */
export function practiceStartsEasy(tier: 'foundational' | 'intermediate' | undefined, level: string): boolean {
  return (tier ?? 'foundational') === 'foundational' || level === 'notStarted' || level === 'introduced'
}

export function PracticeQuestion() {
  const { id = 'm1' } = useParams()
  const review = id === 'review'
  const app = useApp()
  const { business, mastery } = app
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const applied = (review ? LESSON_SCENARIOS : PRACTICE_SCENARIOS)[business]
  const startEasy = !review && params.get('demo') !== 'hint' && practiceStartsEasy(app.learnerLevel, mastery.m1)
  const items: { s: Scenario; basic: boolean }[] = startEasy ? [{ s: basicScenario(applied), basic: true }, { s: applied, basic: false }] : [{ s: applied, basic: false }]
  const [i, setI] = useState(0)
  const item = items[Math.min(i, items.length - 1)]
  return (
    <PracticeItem
      key={i}
      s={item.s}
      basic={item.basic}
      n={i + 1}
      total={items.length}
      review={review}
      onDone={() => (i + 1 < items.length ? setI(i + 1) : navigate('/journey'))}
      last={i + 1 >= items.length}
    />
  )
}

function PracticeItem({ s, basic, n, total, review, onDone, last }: { s: Scenario; basic: boolean; n: number; total: number; review: boolean; onDone: () => void; last: boolean }) {
  const app = useApp()
  const { t } = app
  const options = practiceOptions(s)
  const question = t(basic ? 'pr.qBasic' : 'pr.qApplied', { sales: inr(s.sales), stock: inr(s.stock), waste: inr(s.waste) })

  const [params] = useSearchParams()
  const demoHint = params.get('demo') === 'hint'
  const [selected, setSelected] = useState<string | null>(demoHint ? 'a' : null)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [attempts, setAttempts] = useState(demoHint ? 1 : 0)
  const [result, setResult] = useState<null | { correct: boolean; misconception?: Misconception }>(
    demoHint ? scoreNumeric(s, options[0].value) : null,
  )

  const answerValue = typing ? Number(typed) : options.find((o) => o.id === selected)?.value
  const canCheck = typing ? typed.trim() !== '' : !!selected
  const showWorked = result && !result.correct && attempts >= 2
  const finish = onDone

  let primary: { label: string; onClick: () => void; disabled?: boolean }
  const check = () => {
    const r = scoreNumeric(s, answerValue ?? -1)
    setResult(r)
    setAttempts((a) => a + 1)
    // Practice results go to the learner's progress (deterministic scoring; demo frames are not recorded).
    if (!demoHint)
      app.recordPractice({
        concept: 'revenue_vs_profit',
        itemKey: review ? 'practice:m1:review' : basic ? 'practice:m1:basic' : 'practice:m1:new-day',
        outcome: r.correct ? 'correct' : r.misconception ? 'misconception' : 'incorrect',
        ...(r.misconception ? { misconception: MIS_CODE[r.misconception] } : {}),
        firstTry: attempts === 0,
      })
  }
  if (!result) primary = { label: t('pr.check'), disabled: !canCheck, onClick: check }
  else if (result.correct || showWorked) primary = { label: last ? t('continue') : `${t('pr.next')} →`, onClick: finish }
  else primary = { label: t('pr.tryAgain'), onClick: () => { setResult(null); setSelected(null); setTyped('') } }

  const showChoices = !result?.correct && !showWorked && !typing
  const toneFor = (oid: string, value: number) => {
    if (!result || selected !== oid) return undefined
    return value === profit(s) ? 'right' : 'wrong'
  }

  return (
    <ScreenShell
      back="/journey"
      title={review ? t('journey.review') : t('journey.practiceTitle')}
      step={{ n, total, label: total > 1 ? `${t('questionOf', { n, total })} · ${t(basic ? 'pr.step1' : 'pr.step2')}` : t('questionOf', { n, total }) }}
      footer={<PrimaryButton disabled={primary.disabled} onClick={primary.onClick}>{primary.label}</PrimaryButton>}
    >
      <SumStrip s={s} answer={result?.correct ? profit(s) : undefined} />
      <p className="mt-3 text-xl font-semibold leading-relaxed" data-testid="stem" data-tier={basic ? 'foundational' : 'intermediate'}>
        {question}
      </p>
      <AnswerChoices
        question={question}
        choices={showChoices ? options.map((o) => ({ id: o.id, label: inr(o.value), amount: o.value })) : []}
        readKey={`${review ? 'review' : basic ? 'basic' : 'applied'}-${attempts}`}
        locked={!!result}
        selectedId={selected}
        toneFor={(id) => toneFor(id, options.find((o) => o.id === id)!.value)}
        onSelect={(id) => {
          setTyping(false)
          setSelected(id)
        }}
        voice={
          !typing ? (
            <VoiceAnswer
              questionText={question}
              options={options.map((o) => ({ id: o.id, label: inr(o.value), amount: o.value }))}
              onConfirm={(id) => {
                setTyping(false)
                setSelected(id)
              }}
            />
          ) : null
        }
        feedback={
          <>
            {result?.correct && (
              <Card className="mt-4 bg-leaf-soft" data-testid="practice-feedback" data-correct="true">
                <div className="flex items-center gap-2 text-xl font-bold text-leaf">
                  <span aria-hidden>🎉</span> {t('pr.correctTitle')}
                </div>
                <p className="mb-3 mt-1 text-base leading-relaxed">{t('pr.correctBody2')}</p>
                <Equation s={s} />
                <AudioButton className="mt-3" text={`${t('pr.correctTitle')}. ${t('pr.correctBody2')} ${inr(profit(s))}`} />
              </Card>
            )}
            {result && !result.correct && !showWorked && (
              <Card className="mt-4 bg-clay-soft" data-testid="practice-feedback" data-correct="false">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>💡</span>
                  <p className="text-lg font-semibold leading-relaxed">{t(hintKey(result.misconception, basic))}</p>
                </div>
                <AudioButton className="mt-3" text={t(hintKey(result.misconception, basic))} />
              </Card>
            )}
            {showWorked && (
              <Card className="mt-4 bg-marigold-soft">
                <div className="flex items-center gap-2 text-lg font-bold">
                  <RotateCcw size={20} aria-hidden /> {t('pr.workedTitle')}
                </div>
                <div className="mt-3">
                  <Equation s={s} />
                </div>
                <p className="mt-3 text-base leading-relaxed text-muted">{t('pr.workedNote')}</p>
              </Card>
            )}
          </>
        }
      />

      {!result && (
        <div className="mt-4">
          {typing ? (
            <label className="block">
              <span className="text-sm font-semibold text-muted">{t('pr.typeLabel')}</span>
              <div className="mt-1 flex items-center rounded-2xl bg-white px-4 ring-2 ring-brand">
                <span className="text-2xl font-bold text-muted">₹</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))}
                  className="min-h-[56px] w-full bg-transparent px-2 text-2xl font-bold tabular-nums outline-none"
                  autoFocus
                />
              </div>
            </label>
          ) : null}
          <button
            onClick={() => {
              setTyping(!typing)
              setSelected(null)
            }}
            className="mt-2 inline-flex min-h-[48px] items-center gap-2 text-base font-semibold text-brand"
          >
            <Keyboard size={20} aria-hidden /> {typing ? t('orTap') : t('typeInstead')}
          </button>
        </div>
      )}
    </ScreenShell>
  )
}

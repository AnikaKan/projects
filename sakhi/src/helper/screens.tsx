// Business Helper screens: home (voice + picture cards), Check My Price, Understand My Money.
// Every amount is calculated in helperModel.ts (deterministic). Amounts live only in this screen's state:
// nothing is written to the learner's record or to storage.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ScreenShell } from '../components/ScreenShell'
import { SpeakControls } from '../components/speech/SpeakControls'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import { useApp, type ModuleId } from '../state/AppState'
import { matchSpokenAnswer } from '../speech/answerMatching'
import {
  MONEY_QUESTIONS,
  MONEY_SCENARIOS,
  PRICE_ITEMS,
  PRICE_STEPS,
  TOOLS,
  checkMoneyAnswer,
  checkPrice,
  explainMoney,
  nextPriceStep,
  routeRequest,
  rupees,
  type MoneyScenario,
  type PriceInputs,
  type PriceStep,
  type ToolId,
  EMPTY_PRICE,
} from './helperModel'
import { AmountInput, BigMic, Notice, PictureCard, Question } from './voice'

const fmt = (vars: Record<string, number>) => Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, rupees(v)]))

// ── Home ────────────────────────────────────────────────────────────

export function HelperHome() {
  const { t, lang } = useApp()
  const navigate = useNavigate()
  const [heard, setHeard] = useState<{ text: string; tool: ToolId | null } | null>(null)
  const [soon, setSoon] = useState<ToolId | null>(null)
  const open = (id: ToolId) => (TOOLS.find((x) => x.id === id)!.status === 'ready' ? navigate(`/helper/${id}`) : setSoon(id))
  return (
    <ScreenShell nav title={t('bh.title')}>
      <div className="space-y-4 pt-1" data-testid="helper-home">
        <h1 className="text-center text-[26px] font-bold leading-tight" data-testid="bh-welcome">
          <span aria-hidden>🙏 </span>
          {t('bh.welcome')}
        </h1>
        <SpeakControls className="justify-center" text={t('bh.welcome')} />
        <BigMic
          onText={(text) => {
            const tool = routeRequest(text, lang)
            setHeard({ text, tool })
            if (tool && TOOLS.find((x) => x.id === tool)!.status === 'ready') navigate(`/helper/${tool}`)
            else if (tool) setSoon(tool)
          }}
        />
        {heard && !heard.tool && (
          <div className="rounded-2xl bg-marigold-soft p-3" role="status" data-testid="bh-not-understood">
            <p className="text-base text-muted">{t('bh.heard', { x: heard.text })}</p>
            <p className="text-lg font-semibold">{t('bh.notUnderstood')}</p>
          </div>
        )}
        <p className="text-center text-base font-semibold text-muted">{t('bh.orTap')}</p>
        <div className="grid grid-cols-2 gap-3" data-testid="bh-tools">
          {TOOLS.map((tool) => (
            <PictureCard
              key={tool.id}
              testid={`bh-tool-${tool.id}`}
              emoji={tool.emoji}
              title={t(`bh.tool.${tool.id}`)}
              sub={t(`bh.tool.${tool.id}.sub`)}
              soon={tool.status === 'soon' ? t('bh.soon') : undefined}
              onClick={() => open(tool.id)}
            />
          ))}
        </div>
        <Notice testid="bh-privacy">
          🔒 {t('bh.privacy')} {t('bh.educational')}
        </Notice>
      </div>
      {soon && <SoonSheet tool={soon} onClose={() => setSoon(null)} />}
    </ScreenShell>
  )
}

function SoonSheet({ tool, onClose }: { tool: ToolId; onClose: () => void }) {
  const { t } = useApp()
  const text = t(`bh.soon.${tool}`)
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center" role="dialog" aria-modal="true" data-testid="bh-soon" data-tool={tool}>
      <div className="w-full max-w-[480px] rounded-t-3xl bg-paper p-5 sm:rounded-3xl">
        <div className="text-5xl" aria-hidden>
          {TOOLS.find((x) => x.id === tool)!.emoji}
        </div>
        <h2 className="mt-2 text-2xl font-bold">
          {t(`bh.tool.${tool}`)} · {t('bh.soon')}
        </h2>
        <p className="mt-2 text-lg leading-relaxed">{text}</p>
        <SpeakControls className="mt-3" text={text} />
        <button data-testid="bh-soon-ok" onClick={onClose} className="mt-4 min-h-[56px] w-full rounded-full bg-brand text-lg font-bold text-white">
          {t('bh.ok')}
        </button>
      </div>
    </div>
  )
}

// ── Shared result pieces ────────────────────────────────────────────

function LessonLink({ module, kind, testid }: { module: ModuleId; kind: 'why' | 'practise'; testid: string }) {
  const { t } = useApp()
  return (
    <Link
      to={`/lessons/${module}`}
      data-testid={testid}
      data-module={module}
      className="flex min-h-[56px] items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-2 ring-brand/40 active:bg-brand-soft"
    >
      <span className="text-3xl" aria-hidden>
        {MODULE_EMOJI[module]}
      </span>
      <span>
        <span className="block text-base font-bold text-brand">{t(kind === 'why' ? 'bh.why' : 'bh.practise')}</span>
        <span className="block text-base font-semibold">{t('bh.lesson.open', { title: t(`${module}.title`) })}</span>
      </span>
    </Link>
  )
}

function Row({ emoji, label, amount, kind, onChange, testid }: { emoji: string; label: string; amount: number; kind: 'in' | 'out' | 'owed' | 'result'; onChange?: () => void; testid: string }) {
  const { t } = useApp()
  const cls = kind === 'result' ? (amount < 0 ? 'bg-clay-soft ring-clay/50' : 'bg-leaf-soft ring-leaf/50') : kind === 'owed' ? 'bg-marigold-soft ring-marigold/50' : 'bg-white ring-line'
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-3 py-2 ring-2 ${cls}`} data-testid={testid} data-amount={amount}>
      <span className="text-2xl" aria-hidden>
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-muted">
          {kind === 'out' ? '− ' : kind === 'result' ? '= ' : ''}
          {label}
        </span>
        <span className="block text-2xl font-bold tabular-nums">{rupees(amount)}</span>
      </span>
      {onChange && (
        <button data-testid={`${testid}-change`} onClick={onChange} className="min-h-[44px] rounded-full px-3 text-sm font-bold text-brand ring-1 ring-brand/40">
          ✏️ {t('bh.change')}
        </button>
      )}
    </div>
  )
}

function StepNav({ onBack, onRestart }: { onBack: () => void; onRestart?: () => void }) {
  const { t } = useApp()
  return (
    <div className="flex gap-2">
      <button data-testid="bh-step-back" onClick={onBack} className="min-h-[48px] rounded-full bg-white px-5 text-base font-bold text-brand ring-2 ring-brand/40">
        ← {t('bh.back')}
      </button>
      {onRestart && (
        <button data-testid="bh-restart" onClick={onRestart} className="min-h-[48px] flex-1 rounded-full bg-white px-5 text-base font-bold text-muted ring-1 ring-line">
          ↺ {t('bh.startAgain')}
        </button>
      )}
    </div>
  )
}

// ── Check My Price ──────────────────────────────────────────────────

export function PriceTool() {
  const { t, lang, business } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState<PriceStep>('item')
  const [inp, setInp] = useState<PriceInputs>(EMPTY_PRICE)
  const [returnTo, setReturnTo] = useState<PriceStep | null>(null) // after a correction, go straight back to the result
  const [selfCheck, setSelfCheck] = useState<'yes' | 'unsure' | null>(null)
  const items = PRICE_ITEMS[business]
  const go = (s: PriceStep) => setStep(s)
  const done = (patch: Partial<PriceInputs>) => {
    setInp((x) => ({ ...x, ...patch }))
    setStep(returnTo ?? nextPriceStep(step))
    setReturnTo(null)
  }
  const back = () => {
    const i = PRICE_STEPS.indexOf(step)
    if (i === 0) navigate('/helper')
    else setStep(PRICE_STEPS[i - 1])
  }
  const edit = (s: PriceStep) => {
    setReturnTo('result')
    setStep(s)
  }
  const n = PRICE_STEPS.indexOf(step) + 1
  const itemLabel = inp.item ? t(`bh.item.${inp.item}`) : ''
  const [heardItem, setHeardItem] = useState<string | null>(null)

  return (
    <ScreenShell back="/helper" title={t('bh.tool.price')} step={step === 'result' ? undefined : { n, total: 4, label: t('bh.stepOf', { n, total: 4 }) }}>
      <div className="space-y-4 pt-1" data-testid="bh-price" data-step={step}>
        {step === 'item' && (
          <>
            <Question emoji="🛒" text={t('bh.price.q.item')} speakKey="item" />
            <BigMic
              size="md"
              onText={(text) => {
                const m = matchSpokenAnswer(text, lang, items.map((i) => ({ id: i.id, label: t(`bh.item.${i.id}`) })))
                setHeardItem(text)
                if (m.status === 'match') done({ item: m.optionId })
              }}
            />
            {heardItem && (
              <p className="rounded-xl bg-marigold-soft p-3 text-base" role="status" data-testid="bh-item-heard">
                {t('bh.heard', { x: heardItem })} · {t('bh.orTap')}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {items.map((i) => (
                <PictureCard key={i.id} testid={`bh-item-${i.id}`} emoji={i.emoji} title={t(`bh.item.${i.id}`)} selected={inp.item === i.id} onClick={() => done({ item: i.id })} />
              ))}
            </div>
          </>
        )}
        {step === 'cost' && (
          <>
            <Question emoji="📦" text={t('bh.price.q.cost')} speakKey="cost" />
            <AmountInput key="cost" value={inp.cost} onConfirm={(v) => done({ cost: v })} />
          </>
        )}
        {step === 'extra' && (
          <>
            <Question emoji="🛺" text={t('bh.price.q.extra')} speakKey="extra" />
            <AmountInput key="extra" value={inp.extra} onConfirm={(v) => done({ extra: v })} extra={{ label: `🚫 ${t('bh.price.noExtra')}`, amount: 0 }} />
          </>
        )}
        {step === 'price' && (
          <>
            <Question emoji="🏷️" text={t('bh.price.q.price')} speakKey="price" />
            <AmountInput key="price" value={inp.price} onConfirm={(v) => done({ price: v })} />
          </>
        )}
        {step === 'result' && <PriceResultView inp={inp} itemLabel={itemLabel} onEdit={edit} selfCheck={selfCheck} setSelfCheck={setSelfCheck} />}
        {step === 'result' ? (
          <StepNav
            onBack={() => navigate('/helper')}
            onRestart={() => {
              setInp(EMPTY_PRICE)
              setSelfCheck(null)
              go('item')
            }}
          />
        ) : (
          <StepNav onBack={back} />
        )}
      </div>
    </ScreenShell>
  )
}

function PriceResultView({ inp, itemLabel, onEdit, selfCheck, setSelfCheck }: { inp: PriceInputs; itemLabel: string; onEdit: (s: PriceStep) => void; selfCheck: 'yes' | 'unsure' | null; setSelfCheck: (v: 'yes' | 'unsure') => void }) {
  const { t } = useApp()
  const r = useMemo(() => checkPrice(inp), [inp])
  const msg = t(`bh.price.${r.verdict}`, { price: rupees(r.price), left: rupees(r.remaining), loss: rupees(-r.remaining) })
  const spoken = `${msg} ${t('bh.price.notProfit')}`
  return (
    <div className="space-y-3" data-testid="bh-price-result" data-verdict={r.verdict} data-remaining={r.remaining}>
      <h2 className="text-2xl font-bold">
        <span aria-hidden>🛒 </span>
        {itemLabel}
      </h2>
      <Row testid="bh-row-price" emoji="🏷️" label={t('bh.price.row.price')} amount={r.price} kind="in" onChange={() => onEdit('price')} />
      <Row testid="bh-row-cost" emoji="📦" label={t('bh.price.row.cost')} amount={r.cost} kind="out" onChange={() => onEdit('cost')} />
      <Row testid="bh-row-extra" emoji="🛺" label={t('bh.price.row.extra')} amount={r.extra} kind="out" onChange={() => onEdit('extra')} />
      <Row testid="bh-row-remaining" emoji={r.remaining >= 0 ? '💰' : '⚠️'} label={t('bh.price.row.remaining')} amount={r.remaining} kind="result" />
      <p className="text-lg font-bold leading-snug" data-testid="bh-price-message">
        {msg}
      </p>
      <SpeakControls text={spoken} />
      <Notice testid="bh-price-notes">
        ℹ️ {t('bh.price.notProfit')} {t('bh.price.noFairPrice')}
      </Notice>
      {r.noExtras && (
        <p className="rounded-2xl bg-marigold-soft p-3 text-base font-semibold" data-testid="bh-price-forgot">
          🤔 {t('bh.price.forgot')}
        </p>
      )}
      <div className="rounded-2xl bg-white p-3 ring-1 ring-line" data-testid="bh-selfcheck" data-answer={selfCheck ?? ''}>
        <p className="text-base font-bold">{t('bh.check.q')}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(['yes', 'unsure'] as const).map((k) => (
            <button
              key={k}
              data-testid={`bh-selfcheck-${k}`}
              aria-pressed={selfCheck === k}
              onClick={() => setSelfCheck(k)}
              className={`min-h-[48px] rounded-full text-base font-bold ${selfCheck === k ? 'bg-brand text-white' : 'bg-paper ring-1 ring-line'}`}
            >
              {k === 'yes' ? '👍' : '🤔'} {t(`bh.check.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {(r.noExtras || selfCheck === 'unsure') && <LessonLink module="m2" kind="practise" testid="bh-practise-link" />}
      <LessonLink module={r.lesson} kind="why" testid="bh-why-link" />
    </div>
  )
}

// ── Understand My Money ─────────────────────────────────────────────

const Q_EMOJI: Record<string, string> = { sales: '🧺', goodsCost: '📦', transport: '🛺', smallCosts: '🛍️', received: '💵', boxMoney: '🧰', takenHome: '🏠' }

export function MoneyTool() {
  const { t } = useApp()
  const navigate = useNavigate()
  const [scenario, setScenario] = useState<MoneyScenario | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [qi, setQi] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [returnToResult, setReturnToResult] = useState(false)
  const questions = scenario ? MONEY_QUESTIONS[scenario] : []
  const atResult = !!scenario && qi >= questions.length
  const key = questions[qi]

  const confirm = (v: number) => {
    const c = checkMoneyAnswer(scenario!, answers, key, v)
    if (!c.ok) {
      setError(t(c.key, c.vars ? fmt(c.vars) : undefined))
      return
    }
    setError(null)
    const next = { ...answers, [key]: v }
    // A correction that makes a later answer impossible (e.g. sales now below "received") reopens that question.
    const later = questions.slice(qi + 1).findIndex((k) => next[k] !== undefined && !checkMoneyAnswer(scenario!, next, k, next[k]).ok)
    setAnswers(next)
    if (later >= 0) return setQi(qi + 1 + later)
    setQi(returnToResult ? questions.length : qi + 1)
    setReturnToResult(false)
  }
  const back = () => {
    setError(null)
    if (!scenario) return navigate('/helper')
    if (qi === 0) return setScenario(null)
    setQi(qi - 1)
  }
  const restart = () => {
    setScenario(null)
    setAnswers({})
    setQi(0)
    setError(null)
  }

  return (
    <ScreenShell back="/helper" title={t('bh.tool.money')} step={scenario && !atResult ? { n: qi + 1, total: questions.length, label: t('bh.stepOf', { n: qi + 1, total: questions.length }) } : undefined}>
      <div className="space-y-4 pt-1" data-testid="bh-money" data-scenario={scenario ?? ''} data-step={atResult ? 'result' : (key ?? 'pick')}>
        {!scenario && (
          <>
            <Question emoji="🧮" text={t('bh.money.pick')} speakKey="pick" />
            <div className="grid grid-cols-2 gap-3">
              {MONEY_SCENARIOS.map((s) => (
                <PictureCard key={s.id} testid={`bh-scenario-${s.id}`} emoji={s.emoji} title={t(`bh.money.s.${s.id}`)} onClick={() => setScenario(s.id)} />
              ))}
            </div>
          </>
        )}
        {scenario && !atResult && (
          <>
            <Question emoji={Q_EMOJI[key]} text={t(`bh.q.${key}`, answers.sales !== undefined ? { sales: rupees(answers.sales) } : undefined)} speakKey={`${scenario}-${key}`} />
            <AmountInput key={`${scenario}-${key}`} value={answers[key] ?? null} onConfirm={confirm} error={error} />
          </>
        )}
        {atResult && (
          <MoneyResultView
            scenario={scenario!}
            answers={answers}
            onEdit={(k) => {
              setReturnToResult(true)
              setQi(questions.indexOf(k))
            }}
          />
        )}
        <StepNav onBack={atResult ? () => navigate('/helper') : back} onRestart={atResult ? restart : undefined} />
      </div>
    </ScreenShell>
  )
}

function MoneyResultView({ scenario, answers, onEdit }: { scenario: MoneyScenario; answers: Record<string, number>; onEdit: (k: string) => void }) {
  const { t } = useApp()
  const r = useMemo(() => explainMoney(scenario, answers), [scenario, answers])
  const msg = t(r.message, fmt(r.vars))
  const practise = (scenario === 'credit' && r.vars.owed > 0) || (scenario === 'expenses' && r.message.endsWith('onlyGoods')) || (scenario === 'household' && r.vars.home > 0)
  return (
    <div className="space-y-3" data-testid="bh-money-result" data-scenario={scenario}>
      <h2 className="text-2xl font-bold">
        <span aria-hidden>{MONEY_SCENARIOS.find((s) => s.id === scenario)!.emoji} </span>
        {t(`bh.money.s.${scenario}`)}
      </h2>
      {r.rows.map((row) => (
        <Row
          key={row.key}
          testid={`bh-row-${row.key}`}
          emoji={row.emoji}
          label={t(`bh.row.${row.key}`)}
          amount={row.amount}
          kind={row.kind}
          onChange={MONEY_QUESTIONS[scenario].includes(row.key) ? () => onEdit(row.key) : undefined}
        />
      ))}
      <p className="text-lg font-bold leading-snug" data-testid="bh-money-message" data-key={r.message}>
        {msg}
      </p>
      <SpeakControls text={msg} />
      <Notice>🔒 {t('bh.educational')}</Notice>
      <LessonLink module={r.lesson} kind={practise ? 'practise' : 'why'} testid="bh-why-link" />
    </div>
  )
}

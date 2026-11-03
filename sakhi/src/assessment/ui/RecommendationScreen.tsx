import { useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, CircleDashed, CircleDot, HelpCircle, Sparkles } from 'lucide-react'
import { ScreenShell } from '../../components/ScreenShell'
import { AudioButton, Card, PrimaryButton, SecondaryButton } from '../../components/ui'
import { StallIllustration } from '../../components/Illustrations'
import { useApp } from '../../state/AppState'
import { LESSON_CATALOG } from '../bank'
import { LESSONS } from '../../learning/storage'
import { currentItemId, finalize, startAssessment, submitAnswer } from '../engine'
import { at } from '../i18n'
import { useAssessment } from '../useAssessment'
import type { KeyValueStore } from '../storage'
import { CONCEPTS, type AssessmentResult, type ConceptLevel } from '../types'

const LEVEL_STYLE: Record<ConceptLevel, { icon: typeof Circle; cls: string }> = {
  not_assessed: { icon: CircleDashed, cls: 'bg-line/60 text-muted' },
  gap: { icon: Circle, cls: 'bg-marigold-soft text-[#8A5A12]' },
  unsure: { icon: HelpCircle, cls: 'bg-marigold-soft text-[#8A5A12]' },
  emerging: { icon: CircleDot, cls: 'bg-brand-soft text-brand' },
  consistent: { icon: CheckCircle2, cls: 'bg-leaf-soft text-leaf' },
}

/** Fictional sample used only by the presentation gallery (`?demo=1`) when no result is stored. */
function demoResult(learnerId: string, business: AssessmentResult['business']): AssessmentResult {
  let s = startAssessment({ learnerId, business, attempt: 1, now: '2026-01-01T00:00:00Z', id: 'demo' })
  const picks: Record<string, string> = {
    rvp_a_is_sales_profit: 'yes',
    exp_a_which_is_expense: 'stock',
    crd_a_credit_is_cash: 'no',
    sav_a_keep_stock_money: 'unsure',
    sep_a_record_home_money: 'yes',
  }
  for (let id = currentItemId(s); id; id = currentItemId(s)) s = submitAnswer(s, { itemId: id, optionId: picks[id], source: 'tap', lang: 'en', answeredAt: '2026-01-01T00:01:00Z' }).session
  return finalize(s, { now: '2026-01-01T00:05:00Z' })
}

export function RecommendationScreen({ store }: { store?: KeyValueStore }) {
  const app = useApp()
  const { lang, t, learnerId, business } = app
  const a = useAssessment(learnerId, store)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const result = useMemo(() => a.latest ?? (params.get('demo') ? demoResult(learnerId, business) : null), [a.latest, params, learnerId, business])

  if (!result) return <Navigate to="/assessment" replace />

  const rec = result.recommendation
  const lesson = LESSON_CATALOG.find((l) => l.id === rec.lessonId)!
  const A = (k: string) => at(lang, k)
  const moduleTitle = (c: string) => t(`${LESSON_CATALOG.find((l) => l.concept === c)!.moduleId}.title`)
  const anyEmerging = Object.values(result.conceptLevels).includes('emerging')

  return (
    <ScreenShell
      footer={
        <div className="space-y-3">
          <PrimaryButton data-testid="start-lesson" onClick={() => navigate(`/lessons/${lesson.moduleId}`)}>
            {A('r.start')}
          </PrimaryButton>
          <SecondaryButton
            className="w-full"
            onClick={() => {
              a.start(business)
              navigate('/assessment')
            }}
          >
            {A('r.retry')}
          </SecondaryButton>
        </div>
      }
    >
      <h2 className="text-[26px] font-bold leading-snug">{A('r.title')}</h2>
      <p
        className={`mt-2 inline-block rounded-full px-3 py-1 text-base font-bold ${(result.tier ?? 'foundational') === 'intermediate' ? 'bg-leaf-soft text-leaf' : 'bg-marigold-soft text-[#7A4A0E]'}`}
        data-testid="tier"
        data-tier={result.tier ?? 'foundational'}
      >
        {A(`r.tier.${result.tier ?? 'foundational'}`)}
      </p>

      <Card className="mt-4" >
        <div data-testid="recommendation" data-lesson={rec.lessonId} data-reason={rec.reason}>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 overflow-hidden rounded-xl bg-[#FFF8EE]" aria-hidden>
              <StallIllustration business={result.business} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-muted">{A('r.focus')}</div>
              <div className="text-xl font-bold leading-snug">{t(`${lesson.moduleId}.title`)}</div>
            </div>
          </div>
          <p className="mt-3 text-base leading-relaxed">{A(`r.reason.${rec.reason}`)}</p>
          <p className="mt-1 flex items-start gap-2 text-base leading-relaxed text-muted">
            <Sparkles size={18} className="mt-1 shrink-0 text-marigold" aria-hidden /> {A(`r.why.${rec.concept}`)}
          </p>
          <AudioButton className="mt-3" text={`${t(`${lesson.moduleId}.title`)}. ${A(`r.reason.${rec.reason}`)} ${A(`r.why.${rec.concept}`)}`} />
          {!LESSONS[lesson.id] && (
            <p className="mt-3 rounded-xl bg-brand-soft p-3 text-base leading-relaxed" data-testid="recommendation-with-coach">
              <span className="font-semibold">{t('lesson.notReady.badge')}:</span> {t('lesson.notReady.body')}
            </p>
          )}
        </div>
      </Card>

      <h3 className="mt-5 text-lg font-bold">{A('r.summaryTitle')}</h3>
      <ul className="mt-2 divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
        {CONCEPTS.map((c) => {
          const lvl = result.conceptLevels[c]
          const st = LEVEL_STYLE[lvl]
          const Icon = st.icon
          return (
            <li key={c} className="flex items-center gap-3 px-3 py-2" data-testid={`level-${c}`} data-level={lvl}>
              <Icon size={20} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 text-base font-semibold leading-snug">{moduleTitle(c)}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-sm font-semibold leading-normal ${st.cls}`}>{A(`level.${lvl}`)}</span>
            </li>
          )
        })}
      </ul>
      {anyEmerging && <p className="mt-2 text-sm leading-relaxed text-muted">{A('r.noMastery')}</p>}

      {rec.alsoReview.length > 0 && (
        <p className="mt-4 text-base leading-relaxed">
          <span className="font-semibold">{A('r.alsoReview')}</span> {rec.alsoReview.map(moduleTitle).join(' · ')}
        </p>
      )}
      <button onClick={() => navigate('/home')} className="mt-4 min-h-[48px] text-base font-semibold text-brand underline underline-offset-4">
        {A('r.home')}
      </button>
    </ScreenShell>
  )
}

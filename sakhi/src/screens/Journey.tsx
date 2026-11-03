import { Link, useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ScreenShell } from '../components/ScreenShell'
import { AudioButton, Card } from '../components/ui'
import { MODULE_EMOJI, STATE_EMOJI } from '../components/moduleVisuals'
import { LESSONS } from '../learning/storage'
import { challengeWording } from '../progress/challenges'
import { MVP_CORE, MVP_SEQUENCE } from '../assessment/engine'
import { LESSON_CATALOG } from '../assessment/bank'
import type { ModuleId } from '../state/AppState'
import { conceptOfModule, lessonOfModule, useApp } from '../state/AppState'

const moduleOfConcept = (c: string) => LESSON_CATALOG.find((l) => l.concept === c)!.moduleId as ModuleId
/** Topics in MVP order (docs/MVP_LESSON_PRIORITIZATION.md). */
const ORDER: ModuleId[] = MVP_SEQUENCE.map(moduleOfConcept)
const CORE = new Set<ModuleId>(MVP_CORE.map(moduleOfConcept))

/**
 * My learning (learning-model simplification 2026-11-01). Replaces the Lessons tab and the old
 * My Practice / Progress tabs with ONE list: every topic once, with
 *   status   ✅ Done · ▶ Now · 👩‍🏫 With coach (no lesson in the app yet) · 🔒 Later (not in the MVP yet)
 *   level    ⚪ 🌱 🌿 🌳 and 🔁 "needs more practice"
 *   actions  open the lesson; 🎯 practise / 🔁 review where practice exists (Sales and profit)
 * Today's single next step lives on the Today screen, not here.
 */
export function JourneyScreen() {
  const { t, lang, business, mastery, completed, name, progress, recommendedModule } = useApp()
  const navigate = useNavigate()
  const summary = ORDER.map((m) => {
    const c = progress.concepts[conceptOfModule(m)]
    return `${t(`${m}.title`)}: ${t(`state.${mastery[m]}`)}${c.needsPractice ? `, ${t('prog.needsPractice')}` : ''}`
  }).join('. ')
  const history = [...progress.challenges].reverse()

  return (
    <ScreenShell nav title={t('journey.title')}>
      <Card className="bg-brand text-white" data-testid="journey-summary">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            🌱
          </span>
          <div className="min-w-0">
            <div className="text-xl font-bold">{name}</div>
            <p className="text-base leading-snug text-white/95" data-testid="prog-summary">
              {t('today.done', { n: completed.length })}
            </p>
          </div>
        </div>
        <AudioButton className="mt-3" compact personal label={t('journey.hear')} text={`${name}. ${t('today.done', { n: completed.length })}. ${summary}`} />
      </Card>

      <h3 className="mt-5 text-xl font-bold">{t('journey.path')}</h3>
      <ol className="mt-2 space-y-2.5">
        {ORDER.map((m) => {
          const level = mastery[m]
          const c = progress.concepts[conceptOfModule(m)]
          const lessonId = lessonOfModule(m)
          const lp = progress.lessons[lessonId]
          const inApp = !!LESSONS[lessonId]
          const done = completed.includes(m)
          const now = !done && (m === recommendedModule || lp.status === 'inProgress')
          const status = done ? 'done' : now && inApp ? 'now' : inApp ? 'open' : CORE.has(m) || now ? 'coach' : 'later'
          const chip = { done: `✅ ${t('lessons.done')}`, now: `▶ ${t('lessons.now')}`, open: `▶ ${t('lessons.start')}`, coach: `👩‍🏫 ${t('lessons.withCoach')}`, later: `🔒 ${t('lessons.later')}` }[status]
          const practiceable = m === 'm1' && (level !== 'notStarted' || lp.status !== 'notStarted')
          return (
            <li key={m} data-testid={`prog-${m}`} data-level={level} data-needs-practice={c.needsPractice} data-status={status}>
              <div className={`rounded-2xl p-3 ${status === 'now' ? 'bg-brand text-white shadow-md' : status === 'later' ? 'bg-white/60 ring-1 ring-line' : 'bg-white ring-1 ring-line'}`}>
                <Link to={`/lessons/${m}`} className="flex items-center gap-3" data-testid={`lesson-card-${m}`} data-status={status}>
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${status === 'now' ? 'bg-white' : 'bg-brand-soft'}`} aria-hidden>
                    {MODULE_EMOJI[m]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-lg font-bold leading-snug">{t(`${m}.title`)}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${status === 'now' ? 'bg-white/20' : 'bg-paper ring-1 ring-line'}`}>{chip}</span>
                      {level !== 'notStarted' && (
                        <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${status === 'now' ? 'bg-white/20' : 'bg-paper ring-1 ring-line'}`}>
                          <span aria-hidden>{STATE_EMOJI[level]}</span> {t(`state.${level}`)}
                        </span>
                      )}
                      {c.needsPractice && (
                        <span className="rounded-full bg-clay-soft px-2 py-0.5 text-sm font-semibold text-clay" data-testid={`prog-practice-${m}`}>
                          🔁 {t('prog.needsPractice')}
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight size={22} className="shrink-0 opacity-70" aria-hidden />
                </Link>
                {lp.status === 'inProgress' && lp.resumeStep && LESSONS[lp.lessonId] && (
                  <p className="mt-2 text-base font-semibold">
                    ▶ {t('prog.resume')} · {LESSONS[lp.lessonId]!.text[lang].stepLabels[lp.resumeStep]}
                  </p>
                )}
                {m === 'm1' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      data-testid="journey-practice-m1"
                      data-enabled={practiceable}
                      disabled={!practiceable}
                      onClick={() => navigate('/practice/m1')}
                      className="min-h-[48px] rounded-full bg-marigold px-3 text-base font-bold text-ink disabled:bg-disabled disabled:text-disabled-ink"
                    >
                      🎯 {t('journey.practise')}
                    </button>
                    <button
                      data-testid="journey-practice-review"
                      data-enabled={done}
                      disabled={!done}
                      onClick={() => navigate('/practice/review')}
                      className="min-h-[48px] rounded-full bg-white px-3 text-base font-bold text-ink ring-2 ring-marigold disabled:bg-disabled disabled:text-disabled-ink disabled:ring-0"
                    >
                      🔁 {t('journey.review')}
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      <h3 className="mt-6 text-xl font-bold">🚩 {t('journey.tasks')}</h3>
      {history.length ? (
        <ul className="mt-3 space-y-3">
          {history.map((c) => (
            <li key={c.recordId}>
              <Card className="flex items-start gap-3" data-testid="prog-challenge" data-status={c.status}>
                <span className="text-2xl" aria-hidden>
                  {c.status === 'done' ? '✅' : c.status === 'partly' ? '🌗' : c.status === 'notYet' ? '⏳' : '📌'}
                </span>
                <div className="flex-1">
                  <p className="text-base leading-relaxed">{challengeWording(c.challengeId, lang, business)}</p>
                  <span className="mt-2 inline-block rounded-full bg-marigold-soft px-2.5 py-0.5 text-sm font-semibold">{t(`ch.${c.status}`)}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-lg text-muted">{t('prog.none')}</p>
      )}
    </ScreenShell>
  )
}

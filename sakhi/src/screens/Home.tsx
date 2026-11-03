import { Link, useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { ScreenShell } from '../components/ScreenShell'
import { AudioButton, Card, PrimaryButton } from '../components/ui'
import { StallIllustration } from '../components/Illustrations'
import { LESSONS } from '../learning/storage'
import { challengeWording } from '../progress/challenges'
import { lessonOfModule, moduleOfLesson, useApp } from '../state/AppState'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import { practiceStartsEasy } from './Practice'

/**
 * "Today" (learning-model simplification 2026-11-01): the learner sees only
 *   NOW  — one thing to do (continue / start today's lesson, or today's practice) → the footer button
 *   NEXT — what comes after it (practice after the lesson; the next lesson; or the next topic with the coach)
 *   this week's task, and how many lessons are done (link to My learning).
 */
export function HomeScreen() {
  const { t, lang, name, business, progress, completed, recommendedModule, mastery } = useApp()
  const navigate = useNavigate()
  const today = recommendedModule
  const todayDone = completed.includes(today)
  // Only module 1 has in-app lesson content: for other modules, say so and offer practice instead of a dead end.
  const todayInApp = !!LESSONS[lessonOfModule(today)]

  // An unfinished lesson takes priority: the learner continues where she stopped.
  const resume = Object.values(progress.lessons).find((l) => l.status === 'inProgress' && l.resumeStep && LESSONS[l.lessonId])
  const resumeModule = resume ? moduleOfLesson(resume.lessonId) : null
  const resumeLabel = resume ? LESSONS[resume.lessonId]!.text[lang].stepLabels[resume.resumeStep!] : ''

  const active = progress.activeChallenge
  const activeText = active ? challengeWording(active.challengeId, lang, business) : ''

  // NOW: lesson (continue / start) or practice. NEXT: what follows.
  const now: 'continue' | 'lesson' | 'practice' = resume ? 'continue' : todayInApp && !todayDone ? 'lesson' : 'practice'
  const practiceCount = practiceStartsEasy(progress.assessment.latest?.tier, mastery.m1) ? 2 : 1
  const nextText =
    now !== 'practice'
      ? t('today.afterLesson')
      : todayInApp
        ? t('today.nextLesson', { title: t(`${today}.title`) })
        : t('today.nextCoach', { title: t(`${today}.title`) })
  const nowTitle = now === 'practice' ? t('m1.title') : t(`${resume ? resumeModule : today}.title`)

  const plan = [
    t('home.greeting', { name }),
    active ? `${t(progress.checkInDue ? 'home.checkinTitle' : 'home.challengeTitle')}: ${activeText}` : '',
    `${t('today.now')}: ${now === 'practice' ? t('today.practiceCard') : t('today.lessonCard')}, ${nowTitle}`,
    `${t('today.next')}: ${nextText}`,
  ]

  const footer =
    now === 'continue' ? (
      <PrimaryButton data-action="resume" onClick={() => navigate(`/lessons/${resumeModule}`)}>
        ▶ {t('home.resume')}
      </PrimaryButton>
    ) : now === 'lesson' ? (
      <PrimaryButton data-action="lesson" onClick={() => navigate(`/lessons/${today}`)}>
        ▶ {t('home.start')}
      </PrimaryButton>
    ) : (
      <PrimaryButton data-action="practice-instead" onClick={() => navigate('/practice/m1')}>
        🎯 {t('journey.practiceNow')}
      </PrimaryButton>
    )

  return (
    <ScreenShell nav footer={footer}>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-soft text-2xl" aria-hidden>
          🙏
        </span>
        <h2 className="text-[26px] font-bold leading-tight">{t('home.greeting', { name })}</h2>
      </div>
      <AudioButton className="mt-3" label={t('home.listenPlan')} personal text={plan.filter(Boolean).join('. ')} />

      {active && progress.checkInDue && (
        <Card className="mt-4 bg-marigold-soft" data-testid="home-checkin">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🚩</span>
            <div className="min-w-0">
              <div className="text-lg font-bold">{t('home.checkinTitle')}</div>
              <p className="mt-1 text-base leading-relaxed">{activeText}</p>
            </div>
          </div>
          <PrimaryButton className="mt-3" data-testid="home-checkin-cta" onClick={() => navigate('/checkin')}>
            {t('home.checkinCta')}
          </PrimaryButton>
        </Card>
      )}

      {/* NOW */}
      <p className="mt-5 text-base font-bold uppercase tracking-wide text-brand">👉 {t('today.now')}</p>
      {now === 'continue' ? (
        <Card className="mt-2 flex items-center gap-3 ring-2 ring-brand/40" data-testid="home-resume-card">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-3xl" aria-hidden>
            {MODULE_EMOJI[resumeModule!]}
          </span>
          <div>
            <div className="text-xl font-bold leading-snug">{t(`${resumeModule}.title`)}</div>
            <div className="text-base text-muted">▶ {t('home.resumeStep', { step: resumeLabel })}</div>
          </div>
        </Card>
      ) : now === 'lesson' ? (
        <Card className="mt-2 flex items-center gap-3 ring-2 ring-brand/40" data-testid="home-now" data-kind="lesson">
          <span className="relative w-24 shrink-0 overflow-hidden rounded-xl bg-[#FFF1E0]" aria-hidden>
            <StallIllustration business={business} />
            <span className="absolute bottom-1 left-1 grid h-9 w-9 place-items-center rounded-lg bg-white text-xl shadow">{MODULE_EMOJI[today]}</span>
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-muted">
              📖 {t('today.lessonCard')} · <Clock size={14} aria-hidden /> {t('home.minutes', { n: 8 })}
            </div>
            <div className="mt-0.5 text-xl font-bold leading-snug" data-testid="home-today" data-module={today}>
              {t(`${today}.title`)}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mt-2 flex items-center gap-3 ring-2 ring-brand/40" data-testid="home-now" data-kind="practice">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-marigold-soft text-3xl" aria-hidden>
            🎯
          </span>
          <div>
            <div className="text-sm font-semibold text-muted">{t('today.practiceCard')}</div>
            <div className="text-xl font-bold leading-snug">{t('m1.title')}</div>
            <div className="text-base text-muted">{practiceCount === 1 ? t('today.practiceSub1') : t('today.practiceSub', { n: practiceCount })}</div>
          </div>
        </Card>
      )}

      {/* NEXT */}
      <p className="mt-5 text-base font-bold uppercase tracking-wide text-muted">⏭️ {t('today.next')}</p>
      <div className="mt-2 rounded-2xl bg-white p-3 ring-1 ring-line" data-testid="home-next" data-kind={now !== 'practice' ? 'practice' : todayInApp ? 'lesson' : 'coach'}>
        <p className="text-base font-semibold leading-snug">
          {now !== 'practice' ? '🎯' : todayInApp ? MODULE_EMOJI[today] : '👩‍🏫'} {nextText}
        </p>
        {now === 'practice' && !todayInApp && (
          <p className="mt-1 text-sm leading-relaxed text-muted" data-testid="home-with-coach">
            {t('lesson.notReady.body')}
          </p>
        )}
        {now === 'practice' && <span hidden data-testid="home-today" data-module={today} />}
      </div>

      {active && !progress.checkInDue && (
        <Card className="mt-4 bg-marigold-soft" data-testid="home-challenge">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🚩</span>
            <div className="min-w-0">
              <div className="text-lg font-bold">{t('home.challengeTitle')}</div>
              <p className="mt-1 text-base leading-relaxed">{activeText}</p>
            </div>
          </div>
          <AudioButton className="mt-3" text={`${t('home.challengeTitle')}. ${activeText}`} />
        </Card>
      )}

      <Link to="/journey" className="mt-4 flex min-h-[52px] items-center justify-between gap-2 rounded-2xl bg-white px-4 text-base font-semibold ring-1 ring-line" data-testid="home-done" data-done={completed.length}>
        <span>✅ {t('today.done', { n: completed.length })}</span>
        <span className="text-brand">{t('today.seeAll')} →</span>
      </Link>
      <span hidden data-testid="home-lesson-id">{lessonOfModule(today)}</span>
    </ScreenShell>
  )
}

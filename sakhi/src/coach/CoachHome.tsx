// Coach home: four counts (tap to filter) and one simple learner list, most urgent first.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Search } from 'lucide-react'
import { LANGS } from '../i18n/strings'
import { useApp, moduleOfLesson } from '../state/AppState'
import { MODULE_EMOJI } from '../components/moduleVisuals'
import type { CoachHomeCounts, CoachSummary } from '../coaching/model'
import type { LearnerProfile } from '../progress/types'
import { BUSINESS_EMOJI, LevelChip, StatusChip } from './parts'

type Filter = 'all' | 'attention' | 'challenges' | 'ready'
const CHALLENGE_REASONS = ['challengeNotChecked', 'challengeToVerify', 'challengeBarrier']

export function CoachHome({ rows, counts, selectedId }: { rows: { p: LearnerProfile; s: CoachSummary }[]; counts: CoachHomeCounts; selectedId?: string }) {
  const { tc, coachLang } = useApp()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const list = rows
    .filter(({ s }) =>
      filter === 'attention' ? s.status !== 'doingWell' : filter === 'challenges' ? s.reasons.some((r) => CHALLENGE_REASONS.includes(r)) : filter === 'ready' ? s.readyForNextLesson : true,
    )
    .filter(({ p }) => {
      const n = q.trim().toLowerCase()
      return !n || p.learnerId.toLowerCase().includes(n) || Object.values(p.alias).some((a) => a.toLowerCase().includes(n))
    })
  const tiles: { f: Filter; k: string; n: number; icon: string; cls: string }[] = [
    { f: 'all', k: 'cv.stat.active', n: counts.active, icon: '👩', cls: 'bg-white' },
    { f: 'attention', k: 'cv.stat.attention', n: counts.needAttention, icon: '🚩', cls: 'bg-marigold-soft' },
    { f: 'challenges', k: 'cv.stat.challenges', n: counts.challengesToFollowUp, icon: '🗓️', cls: 'bg-clay-soft' },
    { f: 'ready', k: 'cv.stat.ready', n: counts.readyForNext, icon: '▶️', cls: 'bg-leaf-soft' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2" data-testid="coach-stats">
          {tiles.map((t) => (
            <button
              key={t.f}
              data-testid={`stat-${t.f}`}
              data-count={t.n}
              aria-pressed={filter === t.f}
              onClick={() => setFilter(filter === t.f && t.f !== 'all' ? 'all' : t.f)}
              className={`flex min-h-[76px] flex-col items-start justify-between rounded-2xl p-3 text-left ring-1 ${t.cls} ${filter === t.f ? 'ring-2 ring-brand' : 'ring-line'}`}
            >
              <span className="flex items-center gap-2 text-3xl font-bold tabular-nums leading-none">
                <span className="text-2xl" aria-hidden>
                  {t.icon}
                </span>
                {t.n}
              </span>
              <span className="text-sm font-semibold leading-snug">{tc(t.k)}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{tc('cv.list')}</h2>
          {filter !== 'all' && (
            <button data-testid="filter-clear" onClick={() => setFilter('all')} className="min-h-[40px] rounded-full px-3 text-sm font-semibold text-brand ring-1 ring-brand/40">
              {tc('cv.showAll')}
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-white px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-brand">
          <Search size={18} className="text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc('cv.search')} aria-label={tc('cv.search')} className="min-h-[48px] w-full bg-transparent text-base outline-none" />
        </label>
      </div>
      <ul className="flex-1 space-y-2 overflow-y-auto px-4 pb-4" data-testid="coach-list">
        {!list.length && <li className="rounded-2xl bg-white p-4 text-center text-muted ring-1 ring-line">{tc('cv.noneMatch')}</li>}
        {list.map(({ p, s }) => {
          const m = moduleOfLesson(s.recommendation.recommendedLessonId)
          const attention = s.status !== 'doingWell'
          return (
            <li key={p.learnerId}>
              <Link
                to={`/coach/learner/${p.learnerId}`}
                data-testid={`roster-${p.learnerId}`}
                data-status={s.status}
                className={`flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 ${selectedId === p.learnerId ? 'ring-2 ring-brand' : 'ring-line'} ${attention ? 'border-l-[6px] ' + (s.status === 'followUp' ? 'border-marigold' : 'border-clay') : ''}`}
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand-soft text-3xl" aria-hidden>
                  {BUSINESS_EMOJI[p.business]}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-lg font-bold leading-snug">{p.alias[coachLang]}</span>
                    <span className="text-xs font-semibold text-muted">{p.learnerId}</span>
                  </span>
                  <span className="block text-sm leading-snug text-muted">
                    {tc(`biz.${p.business}`)} · {LANGS.find((l) => l.code === p.language)?.native}
                  </span>
                  <span className="block text-sm font-semibold leading-snug" data-testid={`roster-next-${p.learnerId}`}>
                    <span aria-hidden>{MODULE_EMOJI[m]} </span>
                    {tc(`${m}.title`)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <StatusChip status={s.status} testid={`roster-status-${p.learnerId}`} />
                    <LevelChip level={s.level.value} none={s.level.source === 'none'} />
                  </span>
                  {attention && (
                    <span className="block text-sm leading-snug text-muted" data-testid={`roster-reason-${p.learnerId}`}>
                      {tc(`cv.reason.${s.reasons[0]}`)}
                    </span>
                  )}
                </span>
                <ChevronRight size={22} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
